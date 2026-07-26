# -*- coding: utf-8 -*-
"""
QS Screener - Configuration
============================
Tout se règle ici : les métriques, leurs poids, leur sens, les poids des
piliers, les presets et les règles d'alertes. Aucune autre partie du code
n'a besoin d'être modifiee pour ajuster le systeme de notation.

Sens d'une metrique :
    "H" = plus haut = mieux (High is better)
    "L" = plus bas  = mieux (Low is better)

Une metrique appartient a UN pilier. Le poids est RELATIF a l'interieur
du pilier (les poids d'un pilier sont automatiquement normalises a 100 %).
"""

# ---------------------------------------------------------------------------
# 1) Poids des piliers  (doivent totaliser 100)
# ---------------------------------------------------------------------------
POIDS_PILIERS = {
    "Quality": 45,
    "Health": 20,
    "Growth": 15,
    "Value": 20,
}

# Presets alternatifs, activables avec  --preset <nom>
PRESETS = {
    "defaut":         {"Quality": 45, "Health": 20, "Growth": 15, "Value": 20},
    "quality-purist": {"Quality": 55, "Health": 20, "Growth": 10, "Value": 15},
    "value-aware":    {"Quality": 35, "Health": 20, "Growth": 15, "Value": 30},
}

# ---------------------------------------------------------------------------
# 2) Definition des metriques
#    cle      : identifiant interne (colonne de l'onglet Scores)
#    pilier   : Quality / Health / Growth / Value
#    poids    : poids relatif dans le pilier
#    sens     : "H" ou "L"
#    entetes  : noms de colonne acceptes dans le CSV (le 1er est le nom canonique).
#               La comparaison ignore la casse, les accents et les espaces.
# ---------------------------------------------------------------------------
METRIQUES = [
    # ---- QUALITY  (ROIC 5a et marge FCF 5a renforces, ROIC/FCF-NI alleges) --
    {"cle": "ROIC",         "pilier": "Quality", "poids": 10, "sens": "H",
     "entetes": ["ROIC (%)", "ROIC", "Return on Invested Capital"]},
    {"cle": "ROIC5",        "pilier": "Quality", "poids": 20, "sens": "H",
     "entetes": ["ROIC 5a moy (%)", "ROIC 5Yr Avg", "ROIC 5a"]},
    {"cle": "OpM",          "pilier": "Quality", "poids": 15, "sens": "H",
     "entetes": ["Marge oper. (%)", "Marge operationnelle", "Operating Margin", "Marge oper"]},
    {"cle": "FCFM5",        "pilier": "Quality", "poids": 20, "sens": "H",
     "entetes": ["Marge FCF 5a (%)", "FCF Margin 5Yr Avg", "Free Cash Flow Margin"]},
    {"cle": "FCF_NI",       "pilier": "Quality", "poids": 10, "sens": "H",
     "entetes": ["FCF/Res. net (%)", "FCF / Net Income", "FCF/Net Income"]},
    {"cle": "GM5",          "pilier": "Quality", "poids": 5,  "sens": "H",
     "entetes": ["Marge brute 5a (%)", "Gross Margin 5Yr Avg", "Gross Profit Margin"]},
    {"cle": "ShOut5",       "pilier": "Quality", "poids": 10, "sens": "L",
     "entetes": ["Dilution actions 5a (%)", "Shares Outstanding 5Y CAGR", "Dilution",
                 "Shares Out Growth 5Y (CAGR)", "Shares Out Growth 5Y"]},
    {"cle": "SBC",          "pilier": "Quality", "poids": 10, "sens": "L",
     "entetes": ["SBC/CA (%)", "SBC to Revenue", "SBC/CA", "Stock-based Comp to Revenue"]},

    # ---- HEALTH  (levier & couverture d'interets dominants) ----------------
    {"cle": "NetDebtEBITDA", "pilier": "Health", "poids": 35, "sens": "L",
     "entetes": ["Dette nette/EBITDA", "Net Debt / EBITDA", "Net Debt/EBITDA"]},
    {"cle": "EBITInt",       "pilier": "Health", "poids": 35, "sens": "H",
     "entetes": ["EBIT/Interets", "EBIT / Interest Expense", "EBIT/Interest"]},
    {"cle": "CurrentRatio",  "pilier": "Health", "poids": 5,  "sens": "H",
     "entetes": ["Current ratio", "Current Ratio"]},
    {"cle": "LTDebtAssets",  "pilier": "Health", "poids": 10, "sens": "L",
     "entetes": ["Dette LT/Actifs", "Long-term Debt to Assets", "LT Debt to Assets"]},
    {"cle": "OCF_Capex",     "pilier": "Health", "poids": 15, "sens": "H",
     "entetes": ["OCF/Capex", "Capex Coverage (OCF/Capex)", "Capex Coverage"]},

    # ---- GROWTH  (la croissance du CASH domine ; croissance par action forte)
    {"cle": "Rev5",     "pilier": "Growth", "poids": 15, "sens": "H",
     "entetes": ["CA CAGR 5a (%)", "Revenue 5Y CAGR", "Revenue 5Y"]},
    {"cle": "RevFwd3",  "pilier": "Growth", "poids": 20, "sens": "H",
     "entetes": ["CA fwd 3a (%)", "Revenue Forward 3Y CAGR", "Revenue Forward 3Y"]},
    {"cle": "LevFCF5",  "pilier": "Growth", "poids": 15, "sens": "H",
     "entetes": ["FCF CAGR 5a (%)", "Levered FCF 5Y CAGR", "FCF 5Y CAGR",
                 "Levered Free Cash Flow 5Y CAGR"]},
    {"cle": "NI5",      "pilier": "Growth", "poids": 10, "sens": "H",
     "entetes": ["Res.net CAGR 5a (%)", "Net Income 5Y CAGR", "Net Income 5Y"]},
    # derivees (CAGR de la metrique - CAGR du nombre d'actions) : voir qs_screener
    {"cle": "RevPS5",   "pilier": "Growth", "poids": 15, "sens": "H", "entetes": []},
    {"cle": "FCFPS5",   "pilier": "Growth", "poids": 25, "sens": "H", "entetes": []},

    # ---- VALUE  (EV/FCF allege ; FCF yield reintegre, coherent avec un FCF
    #             leverage/equity ; cf. FCFF vs FCFE) --------------------------
    {"cle": "EV_EBIT",  "pilier": "Value", "poids": 35, "sens": "L",
     "entetes": ["EV/EBIT", "EV / EBIT"]},
    {"cle": "EV_FCF",   "pilier": "Value", "poids": 15, "sens": "L",
     "entetes": ["EV/FCF", "EV / FCF"]},
    {"cle": "FwdP_FCF", "pilier": "Value", "poids": 25, "sens": "L",
     "entetes": ["P/FCF fwd", "Forward P/FCF", "P/FCF forward"]},
    {"cle": "FCFYield", "pilier": "Value", "poids": 25, "sens": "H",
     "entetes": ["FCF Yield (%)", "FCF Yield", "FCF Yield %"]},
]

# ---------------------------------------------------------------------------
# 3) Colonnes d'identification / de reference (non notees)
# ---------------------------------------------------------------------------
COLONNE_TICKER  = ["Ticker", "Symbole", "Symbol"]
COLONNE_SECTEUR = ["Secteur", "Sector"]
COLONNE_CAP     = ["Cap. boursiere ($Md)", "Market Cap", "Cap boursiere", "MarketCap"]

# Colonnes simplement recopiees dans la sortie (reference, pas de note)
COLONNES_REFERENCE = [
    {"cle": "PEG",   "entetes": ["PEG (ref.)", "PEG", "PEG Ratio"]},
    {"cle": "OCF",   "entetes": ["OCF ($Md)", "OCF", "Cash from Operations",
                                 "Operating Cash Flow"]},
    {"cle": "Capex", "entetes": ["Capex ($Md)", "Capex", "Capital Expenditure",
                                 "Capital Expenditures"]},
]

# ---------------------------------------------------------------------------
# 4) Winsorisation (bornage des valeurs extremes avant le classement)
#    Bornes en percentiles. Mettre a None pour desactiver.
# ---------------------------------------------------------------------------
WINSOR_BAS = 2.5
WINSOR_HAUT = 97.5

# Plafonds economiques appliques a la valeur BRUTE avant le classement.
# Au-dela, "plus haut" n'est plus "meilleur" : une conversion FCF/resultat de
# 250% ne vaut pas mieux que 130% (working capital / sous-investissement), et
# une societe asset-light a tres peu de capex ne merite pas un score infini.
PLAFONDS = {
    "FCF_NI": 130,      # cash conversion plafonnee a 130%
    "OCF_Capex": 15,    # couverture du capex plafonnee a 15x
    "EBITInt": 40,      # couverture d'interets plafonnee a 40x (999 = pas de dette)
}

# ---------------------------------------------------------------------------
# 4bis) Reglages "v3" (au-dela de la feuille)
# ---------------------------------------------------------------------------
# Noms courts et lisibles des metriques (affichage Strengths / Weaknesses du PDF).
# En anglais : le rapport PDF est 100% anglais.
NOMS_METRIQUES = {
    "ROIC": "ROIC", "ROIC5": "ROIC 5y", "OpM": "Operating margin",
    "FCFM5": "FCF margin 5y", "FCF_NI": "FCF/Net income conv.", "GM5": "Gross margin",
    "ShOut5": "Low dilution", "SBC": "Low SBC/Revenue",
    "NetDebtEBITDA": "Low leverage", "EBITInt": "Interest coverage",
    "CurrentRatio": "Current ratio", "LTDebtAssets": "Low LT debt",
    "OCF_Capex": "Capex coverage",
    "Rev5": "Revenue growth 5y", "RevFwd3": "Fwd revenue growth", "LevFCF5": "FCF growth 5y",
    "NI5": "Net income growth 5y",
    "RevPS5": "Revenue/share growth 5y", "FCFPS5": "FCF/share growth 5y",
    "EV_EBIT": "Attractive EV/EBIT", "EV_FCF": "Attractive EV/FCF",
    "FwdP_FCF": "Attractive P/FCF fwd", "FCFYield": "FCF yield",
}

# Description detaillee de chaque metrique (page Methodology du PNG). En anglais.
DESCRIPTIONS_METRIQUES = {
    "ROIC": "Return on invested capital: after-tax profit per $ of capital deployed. Core quality marker.",
    "ROIC5": "5-year average ROIC: shows whether high returns are durable, not a one-off.",
    "OpM": "Operating margin: operating profit / revenue. Pricing power and cost discipline.",
    "FCFM5": "5-year average free-cash-flow margin: FCF / revenue. How much cash the model throws off.",
    "FCF_NI": "Cash conversion: free cash flow / net income. >100% = earnings are backed by real cash.",
    "GM5": "5-year average gross margin (low weight: strongly sector-biased, 100% is often an artefact).",
    "ShOut5": "Share count 5y CAGR. Lower/negative = buybacks, no dilution (scored inverted).",
    "SBC": "Stock-based comp / revenue. Hidden cost of equity pay; lower is better (scored inverted).",
    "NetDebtEBITDA": "Net debt / EBITDA. Balance-sheet leverage; lower is safer (scored inverted).",
    "EBITInt": "Interest coverage: EBIT / interest expense. How easily debt interest is paid.",
    "CurrentRatio": "Current ratio: current assets / current liabilities. Short-term solvency.",
    "LTDebtAssets": "Long-term debt / assets. Structural indebtedness; lower is better (scored inverted).",
    "OCF_Capex": "Capex coverage: operating cash flow / capex. >1 = self-funding of investments.",
    "Rev5": "Revenue 5-year CAGR. Historical top-line growth.",
    "RevFwd3": "Expected revenue 3-year forward CAGR (analyst estimates).",
    "LevFCF5": "Levered free cash flow 5-year CAGR. Growth of the cash that actually reaches shareholders.",
    "NI5": "Net income 5-year CAGR. Bottom-line growth.",
    "RevPS5": "Revenue growth adjusted for changes in share count. How much top-line growth accrues per share.",
    "FCFPS5": "FCF growth adjusted for changes in share count. The cash growth that actually accrues per share.",
    "EV_EBIT": "EV / EBIT. Enterprise value vs operating profit; lower is cheaper (scored inverted).",
    "EV_FCF": "EV / free cash flow. Cheapness on a cash basis; lower is better (scored inverted).",
    "FwdP_FCF": "Forward price / free cash flow. Forward-looking cheapness; lower is better (scored inverted).",
    "FCFYield": "FCF yield: free cash flow / market cap. Higher = more cash return for the price paid.",
}

# Note-lettre attribuee selon le score TOTAL (bornes basses, ordre decroissant).
GRILLE_NOTES = [
    ("A+", 70), ("A", 62), ("A-", 55),
    ("B+", 50), ("B", 45), ("B-", 40),
    ("C", 33), ("D", 0),
]

# Risk-adjusted score = TOTAL - (nb d'alertes x MALUS_ALERTE), borne a 0.
MALUS_ALERTE = 2.5

# Couverture de donnees minimale (fraction du poids total du score reellement
# renseignee) pour attribuer une note-lettre. En dessous : note = "NR" (Not Rated).
# Les metriques manquantes ne sont plus mises a 50 : le pilier est recalcule sur
# les metriques disponibles (poids renormalises).
SEUIL_COUVERTURE = 0.75

# Seuil de percentile pour lister une metrique en Force (>=) ou Faiblesse (<=).
SEUIL_FORCE = 70
SEUIL_FAIBLESSE = 30
NB_FORCES = 3           # nb max de forces / faiblesses affichees

# Taille minimale d'un secteur pour calculer des scores INTRA-SECTEUR fiables.
SECTEUR_MIN = 3

# ---------------------------------------------------------------------------
# 4ter) Marqueur de VALORISATION (but du projet : qualite elevee + valo attractive)
# ---------------------------------------------------------------------------
# Niveaux de valorisation d'apres le score du pilier VALUE (percentile 0-100).
# (libelle, seuil bas), ordre decroissant.
NIVEAUX_VALUATION = [
    ("Attractive", 66),   # valo interessante
    ("Fair", 40),         # valo correcte
    ("Expensive", 0),     # valo tendue
]

# "Sweet spot" du projet : valo attractive ET qualite solide ET bilan sain.
# Un titre est marque (*) s'il est 'Attractive' ET Quality >= seuil ET Health >= seuil.
SWEET_SPOT_QUALITE = 60
SWEET_SPOT_SANTE = 50

# ---------------------------------------------------------------------------
# 4quater) SCORING MIXTE  relatif + absolu
#   score_metrique = MELANGE_RELATIF * percentile(secteur si possible, sinon
#                    univers)  +  MELANGE_ABSOLU * score_absolu(ancres)
#   Les ancres empechent qu'une entreprise objectivement mediocre obtienne une
#   excellente note juste parce que ses pairs sont pires.
# ---------------------------------------------------------------------------
# Par defaut : 100% relatif, calcule sur l'univers ENTIER (un seul pool), sans
# percentile sectoriel -> base de comparaison identique pour tous les titres.
# Pour reactiver le volet absolu : MELANGE_ABSOLU > 0 (et MELANGE_RELATIF = 1 - ...).
# Pour comparer chaque titre a son secteur : PERCENTILE_SECTORIEL = True.
MELANGE_RELATIF = 0.70
MELANGE_ABSOLU = 0.30
PERCENTILE_SECTORIEL = False

# Ancres absolues par metrique : (valeur notee 0, valeur notee 100).
# Interpolation lineaire bornee 0-100. Pour une metrique "L" (bas = mieux),
# la valeur notee 100 est simplement plus basse que la valeur notee 0.
# Ce sont des reperes de "quality investing" a ajuster selon tes convictions.
ANCRES_ABSOLUES = {
    # Quality
    "ROIC": (5, 30), "ROIC5": (5, 25), "OpM": (5, 40), "FCFM5": (0, 35),
    "FCF_NI": (50, 110), "GM5": (20, 80),
    "ShOut5": (3, -3), "SBC": (12, 0),
    # Health
    "NetDebtEBITDA": (4, 0), "EBITInt": (2, 15), "CurrentRatio": (0.8, 2.5),
    "LTDebtAssets": (0.6, 0), "OCF_Capex": (1, 10),
    # Growth
    "Rev5": (0, 25), "RevFwd3": (0, 20), "LevFCF5": (0, 25), "NI5": (0, 25),
    "RevPS5": (0, 20), "FCFPS5": (0, 22),
    # Value
    "EV_EBIT": (40, 12), "EV_FCF": (50, 15), "FwdP_FCF": (45, 15), "FCFYield": (1, 7),
}

# Metriques ou une valeur negative est economiquement absurde (multiples de
# valorisation) : elle est notee 0 en absolu, jamais "bon marche".
NEGATIF_PIRE = {"EV_EBIT", "EV_FCF", "FwdP_FCF"}

# ---------------------------------------------------------------------------
# 5) Regles d'alertes (compteur de risques)
#    Chaque regle : (libelle, cle_metrique, operateur, seuil)
#    operateur : ">", ">=", "<", "<=", "==", "!="
#    L'alerte se declenche si  valeur_brute  <operateur>  seuil.
#    Une valeur manquante (neutralisee) ne declenche jamais d'alerte.
# ---------------------------------------------------------------------------
REGLES_ALERTES = [
    ("Share dilution",              "ShOut5",        ">", 0),
    ("SBC/Revenue > 8%",            "SBC",           ">", 8),
    ("Leverage > 2.5x",             "NetDebtEBITDA", ">", 2.5),
    ("EV/FCF > 40 (expensive)",     "EV_FCF",        ">", 40),
    ("Forward growth < 8%",         "RevFwd3",       "<", 8),
]
