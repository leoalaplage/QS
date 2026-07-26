# -*- coding: utf-8 -*-
"""
QS Chart - Graphiques historiques depuis EDGAR (SEC)
====================================================
Complement du QS Screener. La ou le screener travaille sur un INSTANTANE
(export fiscal.ai), ce script va chercher les SERIES PLURIANNUELLES directement
dans l'API XBRL de la SEC (EDGAR) et trace l'evolution d'une metrique sur
10 / 15 ans, sous forme d'une image PNG prete a l'emploi.

Usage interactif (le plus simple) :
    ./.venv/bin/python qs_chart.py
    -> il demande le(s) ticker(s), la metrique (menu) et la duree.

Usage ligne de commande :
    ./.venv/bin/python qs_chart.py --ticker AAPL --metric revenue --annees 15 --open
    ./.venv/bin/python qs_chart.py --ticker AAPL,MSFT --metric fcf_margin --annees 10
    ./.venv/bin/python qs_chart.py --liste          # affiche toutes les metriques

Aucune cle API n'est requise. La SEC demande seulement un header User-Agent
avec un contact (email) : voir SEC_CONTACT ci-dessous.

Source des donnees : SEC EDGAR - https://www.sec.gov/edgar
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import re
import sys
import time
from datetime import date
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ---------------------------------------------------------------------------
# Reglages
# ---------------------------------------------------------------------------
# La SEC exige un User-Agent avec un contact reel. Change l'email si tu veux.
SEC_CONTACT = "leoalaplage@gmail.com"
HEADERS = {"User-Agent": f"QS-Chart/1.0 ({SEC_CONTACT})",
           "Accept-Encoding": "gzip, deflate"}

RACINE = os.path.dirname(os.path.abspath(__file__))
DOSSIER_SORTIE = os.path.join(RACINE, "qs_out")
DOSSIER_CACHE = os.path.join(RACINE, "data", "edgar_cache")
TICKERS_CACHE = os.path.join(RACINE, "data", "sec_company_tickers.json")
# KPI "maison" non taggues en XBRL (ex. retention rate) : saisis a la main ici.
OVERLAY_CSV = os.path.join(RACINE, "data", "kpi_manuel.csv")

URL_TICKERS = "https://www.sec.gov/files/company_tickers.json"
URL_FACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"

# Age max des caches avant re-telechargement (en jours)
AGE_MAX_TICKERS = 30
AGE_MAX_FACTS = 1

# Formes de rapports annuels (US + emetteurs etrangers). Sert de signal de
# fiabilite au classement, pas de filtre exclusif : certaines societes taguent
# la valeur annuelle uniquement dans une DEF 14A, un 8-K, etc.
FORMES_ANNUELLES = {"10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"}

# Frames canoniques de la SEC : CY2023 = duree pleine annee civile,
# CY2023Q4I = photo de fin d'annee (bilan). Meilleur signal d'une valeur
# annuelle "officielle" (dedupliquee des comparatifs).
_RE_FRAME_DUREE = re.compile(r"^CY\d{4}$")
_RE_FRAME_INSTANT = re.compile(r"^CY\d{4}Q4I$")

# ---------------------------------------------------------------------------
# Watchlist (les 29 valeurs du QS Screener)
# ---------------------------------------------------------------------------
WATCHLIST = [
    "NVDA", "AAPL", "GOOGL", "MSFT", "META", "ASML", "V", "MA", "AMAT",
    "LRCX", "KLAC", "ANET", "NOVO B", "HESA.F", "BKNG", "SPGI", "FTNT",
    "NOW", "CME", "ADBE", "MCO", "ICE", "MSCI", "CSU", "VEEV", "CBOE",
    "FICO", "CPRT", "FDS",
]
# Deposants IFRS / etrangers : EDGAR ne fournit pas de donnees us-gaap pour
# eux (depot 20-F en IFRS, ou pas de depot SEC du tout). Non couverts ici.
WATCHLIST_NON_COUVERTS = {"ASML", "NOVO B", "HESA.F", "CSU"}


# ---------------------------------------------------------------------------
# Definition des metriques
# ---------------------------------------------------------------------------
# BASE  : metriques tirees directement d'un ou plusieurs tags XBRL.
#   nom      : libelle affiche
#   cat      : categorie (pour le menu)
#   unite    : "money" | "shares" | "per_share"  (unite d'affichage)
#   graph    : "bar" | "line"  (type de graphe quand une seule entreprise)
#   unites   : unites XBRL a chercher, dans l'ordre de preference
#   tags     : liste de (taxonomie, tag), dans l'ordre de preference. Le 1er
#              tag qui a une valeur pour une annee donnee gagne.
#   abs      : True -> prend la valeur absolue (ex. capex parfois negatif)
# ---------------------------------------------------------------------------
G = "us-gaap"

BASE = {
    # ---- Compte de resultat ----
    "revenue": {
        "nom": "Chiffre d'affaires", "cat": "Compte de resultat",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "RevenueFromContractWithCustomerExcludingAssessedTax"),
                 (G, "RevenueFromContractWithCustomerIncludingAssessedTax"),
                 (G, "Revenues"), (G, "SalesRevenueNet")]},
    "gross_profit": {
        "nom": "Marge brute ($)", "cat": "Compte de resultat",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "GrossProfit")]},
    "operating_income": {
        "nom": "Resultat operationnel", "cat": "Compte de resultat",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "OperatingIncomeLoss")]},
    "net_income": {
        "nom": "Resultat net", "cat": "Compte de resultat",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "NetIncomeLoss"), (G, "ProfitLoss"),
                 (G, "NetIncomeLossAvailableToCommonStockholdersBasic")]},
    "rd": {
        "nom": "R&D (depenses)", "cat": "Compte de resultat",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "ResearchAndDevelopmentExpense")]},
    "interest_expense": {
        "nom": "Charges d'interets", "cat": "Compte de resultat",
        "unite": "money", "graph": "bar", "unites": ["USD"], "menu": False,
        "tags": [(G, "InterestExpense"), (G, "InterestExpenseDebt"),
                 (G, "InterestAndDebtExpense")]},
    "sbc": {
        "nom": "Remuneration en actions (SBC)", "cat": "Compte de resultat",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "ShareBasedCompensation"),
                 (G, "AllocatedShareBasedCompensationExpense")]},
    "cost_revenue": {
        "nom": "Cout des ventes", "cat": "Compte de resultat",
        "unite": "money", "graph": "bar", "unites": ["USD"], "menu": False,
        "tags": [(G, "CostOfRevenue"), (G, "CostOfGoodsAndServicesSold")]},
    "sga": {
        "nom": "Frais SG&A", "cat": "Compte de resultat",
        "unite": "money", "graph": "bar", "unites": ["USD"], "menu": False,
        "tags": [(G, "SellingGeneralAndAdministrativeExpense")]},
    "income_tax": {
        "nom": "Impot sur le resultat", "cat": "Compte de resultat",
        "unite": "money", "graph": "bar", "unites": ["USD"], "menu": False,
        "tags": [(G, "IncomeTaxExpenseBenefit")]},
    "pretax_income": {
        "nom": "Resultat avant impot", "cat": "Compte de resultat",
        "unite": "money", "graph": "bar", "unites": ["USD"], "menu": False,
        "tags": [(G, "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"),
                 (G, "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments")]},
    "eps_diluted": {
        "nom": "BPA dilue (EPS)", "cat": "Compte de resultat",
        "unite": "per_share", "graph": "line", "unites": ["USD/shares"],
        "tags": [(G, "EarningsPerShareDiluted"), (G, "EarningsPerShareBasic")]},

    # ---- Cash-flow ----
    "ocf": {
        "nom": "Cash-flow operationnel (OCF)", "cat": "Cash-flow",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "NetCashProvidedByUsedInOperatingActivities"),
                 (G, "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations")]},
    "capex": {
        "nom": "Capex", "cat": "Cash-flow", "abs": True,
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "PaymentsToAcquirePropertyPlantAndEquipment"),
                 (G, "PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets"),
                 (G, "PaymentsToAcquireProductiveAssets"),
                 (G, "PaymentsForSoftware")]},
    "dividends": {
        "nom": "Dividendes verses", "cat": "Cash-flow", "abs": True,
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "PaymentsOfDividendsCommon"),
                 (G, "PaymentsOfDividendsCommonStock"),
                 (G, "PaymentsOfDividends")]},
    "buybacks": {
        "nom": "Rachats d'actions", "cat": "Cash-flow", "abs": True,
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "PaymentsForRepurchaseOfCommonStock")]},
    "investing_cf": {
        "nom": "Flux d'investissement", "cat": "Cash-flow",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "NetCashProvidedByUsedInInvestingActivities")]},
    "financing_cf": {
        "nom": "Flux de financement", "cat": "Cash-flow",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "NetCashProvidedByUsedInFinancingActivities")]},

    # ---- Bilan ----
    "assets": {
        "nom": "Actif total", "cat": "Bilan",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "Assets")]},
    "equity": {
        "nom": "Capitaux propres", "cat": "Bilan",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "StockholdersEquity"),
                 (G, "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest")]},
    "cash": {
        "nom": "Tresorerie", "cat": "Bilan",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "CashAndCashEquivalentsAtCarryingValue"),
                 (G, "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents")]},
    "lt_debt": {
        "nom": "Dette long terme", "cat": "Bilan",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "LongTermDebtNoncurrent"), (G, "LongTermDebt")]},
    "short_debt": {
        "nom": "Dette court terme", "cat": "Bilan",
        "unite": "money", "graph": "bar", "unites": ["USD"], "menu": False,
        "tags": [(G, "LongTermDebtCurrent"), (G, "DebtCurrent")]},
    "cur_assets": {
        "nom": "Actifs courants", "cat": "Bilan",
        "unite": "money", "graph": "bar", "unites": ["USD"], "menu": False,
        "tags": [(G, "AssetsCurrent")]},
    "cur_liab": {
        "nom": "Passifs courants", "cat": "Bilan",
        "unite": "money", "graph": "bar", "unites": ["USD"], "menu": False,
        "tags": [(G, "LiabilitiesCurrent")]},
    "goodwill": {
        "nom": "Goodwill (survaleur)", "cat": "Bilan",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "Goodwill")]},
    "deferred_revenue": {
        "nom": "Revenu differe (abonnements)", "cat": "Bilan",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "ContractWithCustomerLiabilityCurrent"),
                 (G, "ContractWithCustomerLiability"),
                 (G, "DeferredRevenueCurrent")]},
    "rpo": {
        "nom": "Carnet (RPO)", "cat": "Bilan",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "RevenueRemainingPerformanceObligation")]},
    "retained_earnings": {
        "nom": "Reserves (retained earnings)", "cat": "Bilan",
        "unite": "money", "graph": "bar", "unites": ["USD"],
        "tags": [(G, "RetainedEarningsAccumulatedDeficit")]},

    # ---- Actions ----
    "shares_diluted": {
        "nom": "Nombre d'actions (dilue)", "cat": "Actions",
        "unite": "shares", "graph": "line", "unites": ["shares"],
        "tags": [(G, "WeightedAverageNumberOfDilutedSharesOutstanding"),
                 (G, "WeightedAverageNumberOfSharesOutstandingBasic")]},
}

# DERIVE : metriques calculees a partir des series BASE.
#   besoins : cles BASE necessaires
#   calc    : fonction {cle: {annee: val}} -> {annee: val}
def _ratio_pct(num, den):
    return {a: 100.0 * num[a] / den[a]
            for a in num if a in den and den[a] not in (0, None)}


def _ratio(num, den):
    return {a: num[a] / den[a]
            for a in num if a in den and den[a] not in (0, None)}


def _dette_capitaux(s):
    """Dette totale / capitaux propres, itere sur les capitaux propres."""
    ltd, std, eq = s["lt_debt"], s["short_debt"], s["equity"]
    return {a: (ltd.get(a, 0) + std.get(a, 0)) / eq[a]
            for a in eq if eq[a]}


def _roic(s):
    """ROIC approx. (%) = EBIT x (1 - taux) / capital investi.
    EBIT = resultat operationnel ; taux d'IS forfaitaire = 21 % ;
    capital investi = dette totale + capitaux propres - tresorerie.
    Repere de tendance (peut differer d'un ROIC "maison" au taux reel)."""
    op = s["operating_income"]
    eq, cash = s["equity"], s["cash"]
    ltd, std = s["lt_debt"], s["short_debt"]
    res = {}
    for a in op:
        if a not in eq:
            continue
        ic = eq[a] + ltd.get(a, 0) + std.get(a, 0) - cash.get(a, 0)
        if ic > 0:
            res[a] = 100.0 * op[a] * (1 - 0.21) / ic
    return res


DERIVE = {
    "fcf": {
        "nom": "Free cash-flow (FCF)", "cat": "Cash-flow",
        "unite": "money", "graph": "bar", "besoins": ["ocf", "capex"],
        "calc": lambda s: {a: s["ocf"][a] - s["capex"][a]
                           for a in s["ocf"] if a in s["capex"]}},
    "gross_margin": {
        "nom": "Marge brute (%)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line", "besoins": ["gross_profit", "revenue"],
        "calc": lambda s: _ratio_pct(s["gross_profit"], s["revenue"])},
    "operating_margin": {
        "nom": "Marge operationnelle (%)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line", "besoins": ["operating_income", "revenue"],
        "calc": lambda s: _ratio_pct(s["operating_income"], s["revenue"])},
    "net_margin": {
        "nom": "Marge nette (%)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line", "besoins": ["net_income", "revenue"],
        "calc": lambda s: _ratio_pct(s["net_income"], s["revenue"])},
    "fcf_margin": {
        "nom": "Marge FCF (%)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line", "besoins": ["fcf", "revenue"],
        "calc": lambda s: _ratio_pct(s["fcf"], s["revenue"])},
    "rd_intensity": {
        "nom": "Intensite R&D (R&D/CA %)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line", "besoins": ["rd", "revenue"],
        "calc": lambda s: _ratio_pct(s["rd"], s["revenue"])},
    "roe": {
        "nom": "ROE (%)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line", "besoins": ["net_income", "equity"],
        "calc": lambda s: _ratio_pct(s["net_income"], s["equity"])},
    "roa": {
        "nom": "ROA (%)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line", "besoins": ["net_income", "assets"],
        "calc": lambda s: _ratio_pct(s["net_income"], s["assets"])},
    "roic": {
        "nom": "ROIC approx. (%)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line",
        "besoins": ["operating_income", "equity", "cash", "lt_debt", "short_debt"],
        "calc": _roic},
    "sbc_revenue": {
        "nom": "SBC / CA (%)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line", "besoins": ["sbc", "revenue"],
        "calc": lambda s: _ratio_pct(s["sbc"], s["revenue"])},
    "fcf_conversion": {
        "nom": "Conversion FCF / resultat net (%)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line", "besoins": ["fcf", "net_income"],
        "calc": lambda s: _ratio_pct(s["fcf"], s["net_income"])},
    "effective_tax": {
        "nom": "Taux d'impot effectif (%)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line", "besoins": ["income_tax", "pretax_income"],
        "calc": lambda s: _ratio_pct(s["income_tax"], s["pretax_income"])},
    "sga_margin": {
        "nom": "SG&A / CA (%)", "cat": "Marges & rentabilite",
        "unite": "pct", "graph": "line", "besoins": ["sga", "revenue"],
        "calc": lambda s: _ratio_pct(s["sga"], s["revenue"])},

    # ---- Sante & solvabilite ----
    "current_ratio": {
        "nom": "Current ratio", "cat": "Sante & solvabilite",
        "unite": "ratio", "graph": "line", "besoins": ["cur_assets", "cur_liab"],
        "calc": lambda s: _ratio(s["cur_assets"], s["cur_liab"])},
    "interest_coverage": {
        "nom": "Couverture des interets (EBIT/interets)",
        "cat": "Sante & solvabilite",
        "unite": "ratio", "graph": "line",
        "besoins": ["operating_income", "interest_expense"],
        "calc": lambda s: _ratio(s["operating_income"], s["interest_expense"])},
    "debt_to_equity": {
        "nom": "Dette / capitaux propres", "cat": "Sante & solvabilite",
        "unite": "ratio", "graph": "line",
        "besoins": ["lt_debt", "short_debt", "equity"],
        "calc": _dette_capitaux},
}

# Ordre d'affichage des categories dans le menu
CATEGORIES = ["Compte de resultat", "Marges & rentabilite",
              "Sante & solvabilite", "Cash-flow", "Bilan", "Actions"]


def toutes_les_metriques():
    """Dict fusionne {cle: definition} de toutes les metriques."""
    d = {}
    d.update(BASE)
    d.update(DERIVE)
    return d


# ---------------------------------------------------------------------------
# KPI manuels (overlay CSV) : pour les indicateurs non presents dans EDGAR
# (retention rate, run rate, revenu recurrent %, NPS...). Colonnes :
#   Ticker,KPI,Unite,Annee,Valeur     (Unite : pct|ratio|money|per_share|number)
# ---------------------------------------------------------------------------
_GRAPH_PAR_UNITE = {"money": "bar", "pct": "line", "ratio": "line",
                    "per_share": "line", "shares": "line", "number": "line"}


def charger_overlay() -> dict:
    """Retourne {TICKER: {label_kpi: {'unite','graph','serie':{annee:val}}}}."""
    overlay = {}
    if not os.path.exists(OVERLAY_CSV):
        return overlay
    with open(OVERLAY_CSV, encoding="utf-8-sig", newline="") as f:
        for ligne in csv.DictReader(f):
            # tolere les noms de colonnes en minuscules / avec espaces
            row = {(k or "").strip().lower(): (v or "").strip()
                   for k, v in ligne.items()}
            tk = row.get("ticker", "").upper()
            label = row.get("kpi", "")
            if not tk or not label or not row.get("annee") or not row.get("valeur"):
                continue
            try:
                annee = int(float(row["annee"]))
                val = float(row["valeur"].replace(",", ".").replace("%", ""))
            except ValueError:
                continue
            unite = (row.get("unite") or "number").lower()
            if unite not in _GRAPH_PAR_UNITE:
                unite = "number"
            kpi = overlay.setdefault(tk, {}).setdefault(
                label, {"unite": unite, "graph": _GRAPH_PAR_UNITE[unite],
                        "serie": {}})
            kpi["serie"][annee] = val
    return overlay


def meta_de(cle: str, overlay: dict = None) -> dict:
    """Meta d'une metrique, standard (BASE/DERIVE) ou manuelle (prefixe 'manuel:')."""
    if cle.startswith("manuel:"):
        label = cle[len("manuel:"):]
        for kpis in (overlay or {}).values():
            if label in kpis:
                k = kpis[label]
                return {"nom": label, "unite": k["unite"], "graph": k["graph"],
                        "cat": "KPI manuels", "manuel": True}
        return {"nom": label, "unite": "number", "graph": "line",
                "cat": "KPI manuels", "manuel": True}
    return toutes_les_metriques()[cle]


def serie_de(cle: str, tk: str, facts: dict, cache: dict, overlay: dict) -> dict:
    """Serie {annee: valeur} pour un ticker, standard (EDGAR) ou manuelle (CSV)."""
    if cle.startswith("manuel:"):
        label = cle[len("manuel:"):]
        k = (overlay or {}).get(tk, {}).get(label)
        return dict(k["serie"]) if k else {}
    return construire_serie(facts, cle, cache)


# ---------------------------------------------------------------------------
# Reseau + cache
# ---------------------------------------------------------------------------
def _telecharger(url: str) -> bytes:
    req = Request(url, headers=HEADERS)
    for essai in range(3):
        try:
            with urlopen(req, timeout=30) as r:
                data = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    data = gzip.decompress(data)
                return data
        except HTTPError as e:
            if e.code == 404:
                raise
            time.sleep(1.5 * (essai + 1))
        except URLError:
            time.sleep(1.5 * (essai + 1))
    raise RuntimeError(f"Echec du telechargement : {url}")


def _cache_frais(chemin: str, age_max_jours: int) -> bool:
    if not os.path.exists(chemin):
        return False
    age = time.time() - os.path.getmtime(chemin)
    return age < age_max_jours * 86400


def charger_tickers() -> dict:
    """Retourne {TICKER_MAJ: (cik_int, nom_entreprise)}."""
    os.makedirs(os.path.dirname(TICKERS_CACHE), exist_ok=True)
    if not _cache_frais(TICKERS_CACHE, AGE_MAX_TICKERS):
        print("Telechargement de la liste des tickers SEC...")
        data = _telecharger(URL_TICKERS)
        with open(TICKERS_CACHE, "wb") as f:
            f.write(data)
    with open(TICKERS_CACHE, "rb") as f:
        brut = json.load(f)
    table = {}
    for row in brut.values():
        table[row["ticker"].upper()] = (int(row["cik_str"]), row["title"])
    return table


def charger_facts(cik: int) -> dict:
    """Retourne le JSON companyfacts de la SEC (avec cache local)."""
    os.makedirs(DOSSIER_CACHE, exist_ok=True)
    chemin = os.path.join(DOSSIER_CACHE, f"CIK{cik:010d}.json")
    if not _cache_frais(chemin, AGE_MAX_FACTS):
        url = URL_FACTS.format(cik=cik)
        data = _telecharger(url)
        with open(chemin, "wb") as f:
            f.write(data)
    with open(chemin, "rb") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Extraction des series annuelles
# ---------------------------------------------------------------------------
def _extraire_annuel(lignes: list) -> dict:
    """A partir des points d'un tag/unite, renvoie {annee: valeur} annuel.

    Robuste aux migrations de format : on N'exige PAS un 10-K. Certaines
    societes ne taguent la valeur annuelle que dans une DEF 14A, un 8-K, etc.
    (ex. Mastercard des 2014). On selectionne, par annee fiscale, la meilleure
    valeur selon ce classement decroissant :
        1. presence d'un 'frame' canonique SEC (valeur annuelle officielle) ;
        2. issue d'un rapport annuel (10-K / 20-F...) ;
        3. periode = exercice plein (fp='FY') ;
        4. depot le plus recent.

    Flux (income / cash-flow) : on ne garde que les periodes ~12 mois.
    Stock (bilan) : on ne garde que les photos de fin d'exercice (rapport
    annuel ou frame ...Q4I), jamais un trimestre intermediaire.
    """
    # instant (bilan) si la majorite des points n'ont pas de 'start'
    instant = sum("start" not in r for r in lignes) > len(lignes) / 2
    meilleurs = {}  # annee -> (rang, valeur)
    for r in lignes:
        val = r.get("val")
        if val is None:
            continue
        try:
            fin = date.fromisoformat(r["end"])
        except (KeyError, ValueError):
            continue
        frame = r.get("frame") or ""
        forme_annuelle = r.get("form") in FORMES_ANNUELLES
        if instant:
            if "start" in r:
                continue
            frame_ok = bool(_RE_FRAME_INSTANT.match(frame))
            if not (forme_annuelle or frame_ok):
                continue  # ignore les photos de trimestre intermediaire
            rang = (frame_ok, forme_annuelle, r.get("filed", ""))
        else:
            if "start" not in r:
                continue
            try:
                debut = date.fromisoformat(r["start"])
            except ValueError:
                continue
            jours = (fin - debut).days
            if jours < 300 or jours > 400:
                continue  # trimestre, semestre, YTD... exclus
            frame_ok = bool(_RE_FRAME_DUREE.match(frame))
            rang = (frame_ok, forme_annuelle, r.get("fp") == "FY",
                    r.get("filed", ""))
        annee = fin.year
        if annee not in meilleurs or rang > meilleurs[annee][0]:
            meilleurs[annee] = (rang, val)
    return {a: v[1] for a, v in meilleurs.items()}


def serie_base(facts: dict, cle: str) -> dict:
    """Serie {annee: valeur} pour une metrique BASE (fusion multi-tags)."""
    d = BASE[cle]
    us = facts.get("facts", {})
    resultat = {}
    for taxo, tag in d["tags"]:
        noeud = us.get(taxo, {}).get(tag)
        if not noeud:
            continue
        unites = noeud.get("units", {})
        u = next((x for x in d["unites"] if x in unites), None)
        if u is None:
            continue
        serie = _extraire_annuel(unites[u])
        for annee, val in serie.items():
            if d.get("abs"):
                val = abs(val)
            resultat.setdefault(annee, val)  # 1er tag disponible gagne
    return resultat


def construire_serie(facts: dict, cle: str, _cache: dict) -> dict:
    """Serie {annee: valeur} pour n'importe quelle metrique (BASE ou DERIVE)."""
    if cle in _cache:
        return _cache[cle]
    if cle in BASE:
        serie = serie_base(facts, cle)
    else:
        d = DERIVE[cle]
        sous = {b: construire_serie(facts, b, _cache) for b in d["besoins"]}
        serie = d["calc"](sous)
    _cache[cle] = serie
    return serie


# ---------------------------------------------------------------------------
# Mise en forme
# ---------------------------------------------------------------------------
def _fmt_money(v):
    a = abs(v)
    if a >= 1e12:
        return f"${v / 1e12:.2f}T"
    if a >= 1e9:
        return f"${v / 1e9:.1f}B"
    if a >= 1e6:
        return f"${v / 1e6:.0f}M"
    if a >= 1e3:
        return f"${v / 1e3:.0f}K"
    return f"${v:.0f}"


def _fmt_shares(v):
    a = abs(v)
    if a >= 1e9:
        return f"{v / 1e9:.2f}B"
    if a >= 1e6:
        return f"{v / 1e6:.0f}M"
    return f"{v:.0f}"


def _formateur_axe(unite):
    import matplotlib.ticker as mticker
    if unite == "money":
        return mticker.FuncFormatter(lambda x, _: _fmt_money(x))
    if unite == "pct":
        # decimales automatiques selon l'ecart des graduations (plages etroites)
        return mticker.PercentFormatter(xmax=100, decimals=None, symbol="%")
    if unite == "per_share":
        return mticker.FuncFormatter(lambda x, _: f"${x:.2f}")
    if unite == "shares":
        return mticker.FuncFormatter(lambda x, _: _fmt_shares(x))
    if unite == "ratio":
        return mticker.FuncFormatter(lambda x, _: f"{x:.1f}")
    if unite == "number":
        return mticker.FuncFormatter(lambda x, _: f"{x:g}")
    return mticker.ScalarFormatter()


def _etiquette_valeur(v, unite):
    if unite == "money":
        return _fmt_money(v)
    if unite == "pct":
        return f"{v:.1f}%"
    if unite == "per_share":
        return f"${v:.2f}"
    if unite == "shares":
        return _fmt_shares(v)
    if unite == "ratio":
        return f"{v:.2f}"
    if unite == "number":
        return f"{v:g}"
    return f"{v:.2f}"


def _cagr(serie: dict):
    """CAGR entre la 1re et la derniere annee. None si non pertinent."""
    annees = sorted(serie)
    if len(annees) < 2:
        return None
    a0, a1 = annees[0], annees[-1]
    v0, v1 = serie[a0], serie[a1]
    if v0 is None or v1 is None or v0 <= 0 or v1 <= 0:
        return None
    n = a1 - a0
    if n <= 0:
        return None
    return (v1 / v0) ** (1 / n) - 1


# ---------------------------------------------------------------------------
# Graphe
# ---------------------------------------------------------------------------
COULEURS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2"]


def tracer(meta: dict, series_par_ticker: dict, noms_entreprises: dict,
           annees_fenetre: int, chemin_png: str, dpi: int = 200):
    """series_par_ticker : {TICKER: {annee: valeur}}. Trace et sauve le PNG."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    unite = meta["unite"]
    multi = len(series_par_ticker) > 1
    # bar si une seule entreprise et graph=bar ; sinon lignes
    type_graph = "line" if multi else meta["graph"]

    fig, ax = plt.subplots(figsize=(11, 6))

    # Fenetre temporelle : dernieres N annees, union des tickers
    an_max = max((max(s) for s in series_par_ticker.values() if s), default=None)
    if an_max is None:
        raise ValueError("Aucune donnee a tracer.")
    an_min = an_max - annees_fenetre + 1

    legendes = []
    for i, (tk, serie) in enumerate(series_par_ticker.items()):
        pts = {a: v for a, v in serie.items()
               if an_min <= a <= an_max and v is not None}
        if not pts:
            continue
        xs = sorted(pts)
        ys = [pts[a] for a in xs]
        couleur = COULEURS[i % len(COULEURS)]

        cagr = _cagr(pts) if unite in ("money", "per_share", "shares") else None
        lib = tk if not multi else f"{tk}"
        if cagr is not None:
            lib += f"  (CAGR {cagr * 100:+.1f}%)"
        legendes.append(lib)

        if type_graph == "bar":
            barres = ax.bar(xs, ys, color=couleur, width=0.62,
                            edgecolor="white", linewidth=0.5, zorder=3)
            for x, y in zip(xs, ys):
                ax.annotate(_etiquette_valeur(y, unite), (x, y),
                            textcoords="offset points",
                            xytext=(0, 4 if y >= 0 else -12),
                            ha="center", fontsize=7.5, color="#334155")
        else:
            ax.plot(xs, ys, marker="o", markersize=5, linewidth=2.2,
                    color=couleur, zorder=3)
            if not multi:
                for x, y in zip(xs, ys):
                    ax.annotate(_etiquette_valeur(y, unite), (x, y),
                                textcoords="offset points", xytext=(0, 8),
                                ha="center", fontsize=7.5, color="#334155")

    # Ligne zero si valeurs negatives
    ymin, ymax = ax.get_ylim()
    if ymin < 0 < ymax:
        ax.axhline(0, color="#94a3b8", linewidth=0.8, zorder=1)

    # Titre
    if multi:
        titre = f"{meta['nom']} - {', '.join(series_par_ticker.keys())}"
    else:
        tk = next(iter(series_par_ticker))
        nom = noms_entreprises.get(tk, tk)
        titre = f"{meta['nom']} - {nom} ({tk})"
    ax.set_title(titre, fontsize=14, fontweight="bold", color="#0f172a", pad=14)

    ax.yaxis.set_major_formatter(_formateur_axe(unite))
    ax.set_xlabel("Annee fiscale", fontsize=10, color="#475569")
    ax.margins(x=0.03)
    ax.grid(axis="y", linestyle="--", linewidth=0.6, alpha=0.5, zorder=0)
    ax.spines[["top", "right"]].set_visible(False)
    ax.tick_params(colors="#475569")
    # forcer des annees entieres sur l'axe X
    import matplotlib.ticker as mticker
    ax.xaxis.set_major_locator(mticker.MaxNLocator(integer=True))

    if legendes:
        ax.legend(legendes, frameon=False, fontsize=9, loc="best")

    source = ("Source : saisie manuelle (kpi_manuel.csv)  -  QS Chart"
              if meta.get("manuel") else "Source : SEC EDGAR (XBRL)  -  QS Chart")
    fig.text(0.99, 0.01, source,
             ha="right", va="bottom", fontsize=8, color="#94a3b8")
    fig.tight_layout(rect=(0, 0.02, 1, 1))
    os.makedirs(os.path.dirname(chemin_png), exist_ok=True)
    fig.savefig(chemin_png, dpi=dpi, facecolor="white")
    plt.close(fig)


# ---------------------------------------------------------------------------
# Interface interactive
# ---------------------------------------------------------------------------
def afficher_menu_metriques(tickers=None, overlay=None):
    """Affiche le menu numerote. Si des tickers et un overlay sont fournis,
    ajoute les KPI manuels disponibles pour ces tickers. Renvoie l'index
    {numero -> cle}."""
    metriques = toutes_les_metriques()
    print("\nMetriques disponibles :")
    index = []  # numero -> cle
    n = 1
    for cat in CATEGORIES:
        # on masque les "briques" internes (menu=False) : elles restent
        # utilisables via --metric et servent aux metriques derivees.
        cles = [c for c, d in metriques.items()
                if d["cat"] == cat and d.get("menu", True)]
        if not cles:
            continue
        print(f"\n  --- {cat} ---")
        for c in cles:
            print(f"   {n:>2}. {metriques[c]['nom']}")
            index.append(c)
            n += 1
    # KPI manuels (overlay) pour les tickers selectionnes
    if tickers and overlay:
        tkset = [t[0] for t in tickers]
        labels, vus = [], set()
        for tk in tkset:
            for label in overlay.get(tk, {}):
                if label not in vus:
                    vus.add(label)
                    labels.append(label)
        if labels:
            print("\n  --- KPI manuels (data/kpi_manuel.csv) ---")
            for label in labels:
                dispo = [tk for tk in tkset if label in overlay.get(tk, {})]
                print(f"   {n:>2}. {label}  [{', '.join(dispo)}]")
                index.append("manuel:" + label)
                n += 1
    return index


def parser_selection(saisie: str, taille: int) -> list:
    """Interprete '1,7,12', des plages '20-23', ou 'tout'. Renvoie des numeros."""
    s = saisie.strip().lower()
    if s in ("tout", "toutes", "all", "*"):
        return list(range(1, taille + 1))
    nums = []
    for tok in s.replace(";", ",").split(","):
        tok = tok.strip()
        if "-" in tok:
            a, b = tok.split("-", 1)
            if a.strip().isdigit() and b.strip().isdigit():
                nums.extend(range(int(a), int(b) + 1))
        elif tok.isdigit():
            nums.append(int(tok))
    return nums


def afficher_watchlist():
    """Affiche la watchlist numerotee ; renvoie l'index {num: TICKER}."""
    print("\nTa watchlist (QS Screener) :")
    largeur = 3
    lignes = []
    for i, tk in enumerate(WATCHLIST, 1):
        marque = " *" if tk in WATCHLIST_NON_COUVERTS else ""
        lignes.append(f"{i:>2}. {tk + marque:<10}")
    for i in range(0, len(lignes), largeur):
        print("   " + "".join(lignes[i:i + largeur]))
    if WATCHLIST_NON_COUVERTS:
        print("   (* IFRS/etranger : non couvert par EDGAR us-gaap)")
    return {i: tk for i, tk in enumerate(WATCHLIST, 1)}


def expandre_saisie_tickers(saisie: str, index_wl: dict) -> str:
    """Remplace les numeros de watchlist par leur ticker ; laisse le reste."""
    sortie = []
    for tok in [t.strip() for t in saisie.replace(";", ",").split(",") if t.strip()]:
        if tok.isdigit() and int(tok) in index_wl:
            sortie.append(index_wl[int(tok)])
        else:
            sortie.append(tok)
    return ",".join(sortie)


def demander(prompt, defaut=None):
    txt = f"{prompt}"
    if defaut is not None:
        txt += f" [{defaut}]"
    txt += " : "
    rep = input(txt).strip()
    return rep if rep else (defaut if defaut is not None else "")


def resoudre_tickers(saisie: str, table: dict):
    """Retourne [(TICKER, cik, nom)] pour les tickers valides ; alerte sinon."""
    resultat = []
    for tk in [t.strip().upper() for t in saisie.replace(";", ",").split(",") if t.strip()]:
        if tk in table:
            cik, nom = table[tk]
            resultat.append((tk, cik, nom))
        else:
            print(f"  ! Ticker introuvable dans EDGAR : {tk} (ignore)")
    return resultat


def flux_interactif(table: dict, overlay: dict):
    print("=" * 60)
    print("  QS Chart - graphiques historiques depuis EDGAR (SEC)")
    print("=" * 60)

    # 1) Ticker(s) - au choix : un numero de watchlist, ou un/des ticker(s)
    index_wl = afficher_watchlist()
    while True:
        saisie = demander(
            "\nNumero(s) de watchlist ou ticker(s) (ex. 3 ou AAPL,MSFT ou 1,3,5)")
        saisie = expandre_saisie_tickers(saisie, index_wl)
        tickers = resoudre_tickers(saisie, table)
        if tickers:
            for tk, _, nom in tickers:
                print(f"  -> {tk} : {nom}")
            break
        print("  Aucun ticker valide, reessaie.")

    # 2) Metrique(s) - plusieurs possibles : une image par metrique
    index = afficher_menu_metriques(tickers, overlay)
    while True:
        saisie = demander(
            "\nNumero(s) - plusieurs OK : '1,7,12', plage '20-23', ou 'tout'")
        nums = parser_selection(saisie, len(index))
        # dedoublonne en gardant l'ordre
        cles, vus = [], set()
        for m in nums:
            if 1 <= m <= len(index) and index[m - 1] not in vus:
                vus.add(index[m - 1])
                cles.append(index[m - 1])
        if cles:
            print(f"  -> {len(cles)} graphe(s) a generer")
            break
        print("  Choix invalide, reessaie.")

    # 3) Duree
    while True:
        rep = demander("\nDuree en annees", "15")
        try:
            annees = int(rep)
            if annees >= 2:
                break
        except ValueError:
            pass
        print("  Entre un nombre d'annees >= 2.")

    # 4) Ouvrir a la fin ?
    ouvrir = demander("\nOuvrir l'image a la fin ? (o/n)", "o").lower().startswith("o")

    return tickers, cles, annees, ouvrir


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------
def generer(tickers, cles_metriques, annees, dpi=200, ouvrir=False, overlay=None):
    """tickers : [(TICKER, cik, nom)]. Genere un PNG par metrique."""
    overlay = overlay or {}
    # Recuperer les facts une fois par entreprise (sauf si tout est manuel)
    besoin_edgar = any(not c.startswith("manuel:") for c in cles_metriques)
    facts_par_tk = {}
    noms = {}
    caches = {}
    for tk, cik, nom in tickers:
        noms[tk] = nom
        caches[tk] = {}
        if not besoin_edgar:
            facts_par_tk[tk] = {}
            continue
        print(f"\nRecuperation EDGAR : {tk} (CIK {cik})...")
        try:
            facts_par_tk[tk] = charger_facts(cik)
        except HTTPError as e:
            print(f"  ! Erreur SEC pour {tk} : HTTP {e.code} (ignore)")
        except Exception as e:  # noqa: BLE001
            print(f"  ! Erreur pour {tk} : {e} (ignore)")

    if not facts_par_tk:
        print("Aucune donnee recuperee. Arret.")
        return []

    fichiers = []
    for cle in cles_metriques:
        meta = meta_de(cle, overlay)
        series_par_tk = {}
        for tk in facts_par_tk:
            serie = serie_de(cle, tk, facts_par_tk[tk], caches[tk], overlay)
            if serie:
                series_par_tk[tk] = serie
            else:
                print(f"  ! Pas de donnee '{meta['nom']}' pour {tk}")
        if not series_par_tk:
            print(f"  Metrique '{meta['nom']}' : aucune donnee, ignoree.")
            continue

        suffixe_tk = "_".join(series_par_tk.keys())
        cle_fic = cle.replace("manuel:", "").replace(" ", "-")
        nom_fic = f"QS_Chart_{suffixe_tk}_{cle_fic}.png"
        chemin = os.path.join(DOSSIER_SORTIE, nom_fic)
        try:
            tracer(meta, series_par_tk, noms, annees, chemin, dpi=dpi)
            print(f"  OK -> {os.path.relpath(chemin, RACINE)}")
            fichiers.append(chemin)
        except Exception as e:  # noqa: BLE001
            print(f"  ! Echec du trace pour '{meta['nom']}' : {e}")

    if ouvrir and fichiers and sys.platform == "darwin":
        os.system("open " + " ".join(f'"{f}"' for f in fichiers))
    return fichiers


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main(argv=None):
    p = argparse.ArgumentParser(
        description="Graphiques PNG de metriques historiques depuis EDGAR (SEC).")
    p.add_argument("--ticker", help="Ticker(s), ex. AAPL ou AAPL,MSFT")
    p.add_argument("--metric", help="Cle(s) de metrique, ex. revenue,fcf_margin")
    p.add_argument("--annees", type=int, default=15, help="Duree (annees, defaut 15)")
    p.add_argument("--dpi", type=int, default=200, help="Resolution PNG (defaut 200)")
    p.add_argument("--open", action="store_true", help="Ouvrir l'image a la fin")
    p.add_argument("--liste", action="store_true", help="Lister les metriques et quitter")
    p.add_argument("--watchlist", action="store_true", help="Lister la watchlist et quitter")
    args = p.parse_args(argv)

    if args.liste:
        afficher_menu_metriques()
        print("\n(utilise la CLE en minuscules avec --metric, ex. --metric revenue)")
        print("Cles :", ", ".join(toutes_les_metriques().keys()))
        return

    if args.watchlist:
        afficher_watchlist()
        return

    try:
        table = charger_tickers()
    except Exception as e:  # noqa: BLE001
        print(f"Impossible de charger la liste des tickers SEC : {e}")
        sys.exit(1)

    overlay = charger_overlay()

    # Mode CLI si ticker ET metric fournis, sinon interactif
    if args.ticker and args.metric:
        index_wl = {i: tk for i, tk in enumerate(WATCHLIST, 1)}
        saisie = expandre_saisie_tickers(args.ticker, index_wl)
        tickers = resoudre_tickers(saisie, table)
        if not tickers:
            print("Aucun ticker valide.")
            sys.exit(1)
        metriques = toutes_les_metriques()
        cles, inconnues = [], []
        for m in args.metric.replace(";", ",").split(","):
            m = m.strip()
            if not m:
                continue
            # cle standard, ou KPI manuel via 'manuel:Label'
            if m in metriques or (m.startswith("manuel:") and m[7:] in
                                  {lbl for k in overlay.values() for lbl in k}):
                cles.append(m)
            else:
                inconnues.append(m)
        for m in inconnues:
            print(f"  ! Metrique inconnue : {m} (ignoree)")
        if not cles:
            print("Aucune metrique valide. Utilise --liste pour les voir.")
            sys.exit(1)
        generer(tickers, cles, args.annees, dpi=args.dpi, ouvrir=args.open,
                overlay=overlay)
    else:
        tickers, cles, annees, ouvrir = flux_interactif(table, overlay)
        generer(tickers, cles, annees, dpi=args.dpi, ouvrir=ouvrir,
                overlay=overlay)


if __name__ == "__main__":
    main()
