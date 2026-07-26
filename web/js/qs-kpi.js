// =====================================================================
//  QS - Fiche KPI par societe, construite depuis EDGAR
//
//  Meme source et memes conventions que les graphes : les flux sont pris
//  en TTM (4 trimestres consecutifs) quand c'est possible, sinon sur le
//  dernier exercice ; les postes de bilan sont pris a leur derniere date.
//  Les CAGR sont calcules sur les series ANNUELLES, seules comparables
//  d'une annee sur l'autre.
//
//  Aucune valeur n'est estimee : une donnee absente reste absente.
// =====================================================================

import { construireSerie, MODES, decoderCle } from "./qs-chart-edgar.js";
import { toutesLesMetriques } from "./qs-chart-metrics.js";

/** Dernier point d'une serie, avec sa periode. */
function dernier(serie) {
  const cles = Object.keys(serie).sort((a, b) => decoderCle(a).x - decoderCle(b).x);
  if (!cles.length) return null;
  const c = cles[cles.length - 1];
  return { cle: c, x: decoderCle(c).x, valeur: serie[c] };
}

/**
 * CAGR sur n annees a partir d'une serie ANNUELLE.
 * Renvoie null si l'historique est trop court, ou si un signe rend le
 * taux absurde (passer de -2 a +5 n'a pas de taux de croissance).
 */
function cagrAnnees(serieAnnuelle, n) {
  const annees = Object.keys(serieAnnuelle).map(Number).sort((a, b) => a - b);
  if (annees.length < 2) return null;
  const fin = annees[annees.length - 1];
  const debut = fin - n;
  if (!annees.includes(debut)) return null;
  const v0 = serieAnnuelle[debut], v1 = serieAnnuelle[fin];
  if (v0 === null || v1 === null || v0 <= 0 || v1 <= 0) return null;
  return (Math.pow(v1 / v0, 1 / n) - 1) * 100;
}

/** Variation totale en % entre l'annee la plus recente et n ans avant. */
function variationAnnees(serieAnnuelle, n) {
  const annees = Object.keys(serieAnnuelle).map(Number).sort((a, b) => a - b);
  if (!annees.length) return null;
  const fin = annees[annees.length - 1];
  const debut = fin - n;
  if (!annees.includes(debut)) return null;
  const v0 = serieAnnuelle[debut], v1 = serieAnnuelle[fin];
  if (!v0) return null;
  return ((v1 - v0) / Math.abs(v0)) * 100;
}

// Ce que la fiche affiche, dans l'ordre.
//   cle        : metrique de qs-chart-metrics
//   mode       : "ttm" (avec repli annuel) ou "annuel"
//   croissance : ajoute les CAGR 3 / 5 / 10 ans
const LIGNES = [
  { groupe: "Scale" },
  { cle: "revenue", mode: "ttm", croissance: true },
  { cle: "operating_income", mode: "ttm" },
  { cle: "net_income", mode: "ttm", croissance: true },
  { cle: "fcf", mode: "ttm", croissance: true },
  { cle: "eps_diluted", mode: "ttm", croissance: true },

  { groupe: "Margins" },
  { cle: "gross_margin", mode: "ttm" },
  { cle: "operating_margin", mode: "ttm" },
  { cle: "net_margin", mode: "ttm" },
  { cle: "fcf_margin", mode: "ttm" },

  { groupe: "Returns" },
  { cle: "roic", mode: "ttm" },
  { cle: "roe", mode: "ttm" },
  { cle: "roa", mode: "ttm" },
  { cle: "fcf_conversion", mode: "ttm" },

  { groupe: "Balance sheet" },
  { cle: "current_ratio", mode: "ttm" },
  { cle: "debt_to_equity", mode: "ttm" },
  { cle: "interest_coverage", mode: "ttm" },
  { cle: "cash", mode: "ttm" },

  { groupe: "Capital & shareholders" },
  { cle: "capex", mode: "ttm" },
  { cle: "sbc_revenue", mode: "ttm" },
  { cle: "shares_diluted", mode: "ttm", dilution: true },
  { cle: "buybacks", mode: "ttm" },
  { cle: "dividends", mode: "ttm" },
];

/**
 * Construit la fiche KPI d'une societe.
 * @returns {{lignes: Array, devise: string|null, periode: string|null}}
 */
export function ficheKpi(facts) {
  const metriques = toutesLesMetriques();
  const cacheTTM = {}, cacheAnnuel = {};
  const rapportMuet = () => ({
    tags: [], devises: new Set(), formes: new Set(), derives: [], incoherences: [], points: 0,
  });

  const devises = new Set();
  let periode = null;
  const lignes = [];

  for (const spec of LIGNES) {
    if (spec.groupe) { lignes.push({ groupe: spec.groupe }); continue; }
    const def = metriques[spec.cle];
    if (!def) continue;

    const rap = rapportMuet();
    let serie = construireSerie(facts, spec.cle, MODES.TTM, cacheTTM, rap);
    let base = "TTM";
    // Un deposant qui ne publie qu'un rapport annuel n'a pas de TTM : on
    // bascule sur l'exercice plutot que d'afficher une case vide.
    if (!Object.keys(serie).length) {
      const rapA = rapportMuet();
      serie = construireSerie(facts, spec.cle, MODES.ANNUEL, cacheAnnuel, rapA);
      base = "FY";
      for (const d of rapA.devises) devises.add(d);
    } else {
      for (const d of rap.devises) devises.add(d);
    }

    const d = dernier(serie);
    const annuel = construireSerie(facts, spec.cle, MODES.ANNUEL, cacheAnnuel, rapportMuet());

    const ligne = {
      cle: spec.cle, nom: def.nom, unite: def.unite, base,
      valeur: d ? d.valeur : null,
      periode: d ? d.cle : null,
    };
    if (d && !periode && base === "TTM") periode = d.cle;

    if (spec.croissance) {
      ligne.cagr = { 3: cagrAnnees(annuel, 3), 5: cagrAnnees(annuel, 5), 10: cagrAnnees(annuel, 10) };
    }
    if (spec.dilution) {
      // pour le nombre d'actions, la variation totale parle mieux qu'un CAGR
      ligne.variation = { 3: variationAnnees(annuel, 3), 5: variationAnnees(annuel, 5) };
    }
    lignes.push(ligne);
  }

  return { lignes, devise: [...devises][0] || null, periode };
}

/**
 * Les memes KPI, mis au format des colonnes attendues par le screener.
 * C'est le pont entre les deux pages : on peut noter un univers construit
 * depuis EDGAR sans passer par un export exterieur.
 *
 * Les colonnes que la SEC ne permet pas de calculer (tout ce qui depend
 * du COURS : capitalisation, EV/EBIT, P/FCF, FCF yield) sont volontairement
 * absentes -- le screener les neutralisera et le dira.
 */
export function ligneScreener(ticker, facts) {
  const cacheTTM = {}, cacheAnnuel = {};
  const muet = () => ({ tags: [], devises: new Set(), formes: new Set(), derives: [], incoherences: [], points: 0 });
  const val = (cle) => {
    const d = dernier(construireSerie(facts, cle, MODES.TTM, cacheTTM, muet()))
      || dernier(construireSerie(facts, cle, MODES.ANNUEL, cacheAnnuel, muet()));
    return d ? d.valeur : null;
  };
  const annuel = (cle) => construireSerie(facts, cle, MODES.ANNUEL, cacheAnnuel, muet());
  const moyenne5 = (cle) => {
    const s = annuel(cle);
    const annees = Object.keys(s).map(Number).sort((a, b) => b - a).slice(0, 5);
    if (!annees.length) return null;
    return annees.reduce((a, y) => a + s[y], 0) / annees.length;
  };

  return {
    Ticker: ticker,
    "Return on Invested Capital": val("roic"),
    "ROIC 5Yr Avg": moyenne5("roic"),
    "Operating Margin": val("operating_margin"),
    "FCF Margin 5Yr Avg": moyenne5("fcf_margin"),
    "FCF / Net Income": val("fcf_conversion"),
    "Gross Margin 5Yr Avg": moyenne5("gross_margin"),
    "Shares Out Growth 5Y (CAGR)": cagrAnnees(annuel("shares_diluted"), 5),
    "Stock-based Comp to Revenue": val("sbc_revenue"),
    "Current Ratio": val("current_ratio"),
    "EBIT / Interest Expense": val("interest_coverage"),
    "Revenue 5Y CAGR": cagrAnnees(annuel("revenue"), 5),
    "Net Income 5Y CAGR": cagrAnnees(annuel("net_income"), 5),
    "Levered Free Cash Flow 5Y CAGR": cagrAnnees(annuel("fcf"), 5),
  };
}

/** Colonnes du screener qu'EDGAR ne peut pas fournir (elles dependent du cours). */
export const COLONNES_HORS_PORTEE = [
  "Market Cap", "EV/EBIT", "EV/FCF", "Forward P/FCF", "FCF Yield",
  "Net Debt / EBITDA", "Long-term Debt to Assets", "Revenue Forward 3Y CAGR",
];
