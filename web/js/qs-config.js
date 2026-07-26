// =====================================================================
//  QS Screener - Configuration
//  Port fidele de qs_config.py. C'est ICI qu'on regle le systeme de
//  notation : poids, sens, ancres, alertes, seuils.
//  Toute modification doit rester synchronisee avec qs_config.py.
// =====================================================================

export const PILIERS = ["Quality", "Health", "Growth", "Value"];

// ---------------------------------------------------------------------
// 1) Poids des piliers (total = 100)
// ---------------------------------------------------------------------
export const POIDS_PILIERS = {
  Quality: 45,
  Health: 20,
  Growth: 15,
  Value: 20,
};

export const PRESETS = {
  "defaut": { Quality: 45, Health: 20, Growth: 15, Value: 20 },
  "quality-purist": { Quality: 55, Health: 20, Growth: 10, Value: 15 },
  "value-aware": { Quality: 35, Health: 20, Growth: 15, Value: 30 },
};

// ---------------------------------------------------------------------
// 2) Definition des metriques
//    sens : "H" = plus haut = mieux, "L" = plus bas = mieux
//    entetes : noms de colonnes acceptes (casse/accents/espaces ignores)
// ---------------------------------------------------------------------
export const METRIQUES = [
  // ---- QUALITY ----
  { cle: "ROIC", pilier: "Quality", poids: 10, sens: "H",
    entetes: ["ROIC (%)", "ROIC", "Return on Invested Capital"] },
  { cle: "ROIC5", pilier: "Quality", poids: 20, sens: "H",
    entetes: ["ROIC 5a moy (%)", "ROIC 5Yr Avg", "ROIC 5a"] },
  { cle: "OpM", pilier: "Quality", poids: 15, sens: "H",
    entetes: ["Marge oper. (%)", "Marge operationnelle", "Operating Margin", "Marge oper"] },
  { cle: "FCFM5", pilier: "Quality", poids: 20, sens: "H",
    entetes: ["Marge FCF 5a (%)", "FCF Margin 5Yr Avg", "Free Cash Flow Margin"] },
  { cle: "FCF_NI", pilier: "Quality", poids: 10, sens: "H",
    entetes: ["FCF/Res. net (%)", "FCF / Net Income", "FCF/Net Income"] },
  { cle: "GM5", pilier: "Quality", poids: 5, sens: "H",
    entetes: ["Marge brute 5a (%)", "Gross Margin 5Yr Avg", "Gross Profit Margin"] },
  { cle: "ShOut5", pilier: "Quality", poids: 10, sens: "L",
    entetes: ["Dilution actions 5a (%)", "Shares Outstanding 5Y CAGR", "Dilution",
              "Shares Out Growth 5Y (CAGR)", "Shares Out Growth 5Y"] },
  { cle: "SBC", pilier: "Quality", poids: 10, sens: "L",
    entetes: ["SBC/CA (%)", "SBC to Revenue", "SBC/CA", "Stock-based Comp to Revenue"] },

  // ---- HEALTH ----
  { cle: "NetDebtEBITDA", pilier: "Health", poids: 35, sens: "L",
    entetes: ["Dette nette/EBITDA", "Net Debt / EBITDA", "Net Debt/EBITDA"] },
  { cle: "EBITInt", pilier: "Health", poids: 35, sens: "H",
    entetes: ["EBIT/Interets", "EBIT / Interest Expense", "EBIT/Interest"] },
  { cle: "CurrentRatio", pilier: "Health", poids: 5, sens: "H",
    entetes: ["Current ratio", "Current Ratio"] },
  { cle: "LTDebtAssets", pilier: "Health", poids: 10, sens: "L",
    entetes: ["Dette LT/Actifs", "Long-term Debt to Assets", "LT Debt to Assets"] },
  { cle: "OCF_Capex", pilier: "Health", poids: 15, sens: "H",
    entetes: ["OCF/Capex", "Capex Coverage (OCF/Capex)", "Capex Coverage"] },

  // ---- GROWTH ----
  { cle: "Rev5", pilier: "Growth", poids: 15, sens: "H",
    entetes: ["CA CAGR 5a (%)", "Revenue 5Y CAGR", "Revenue 5Y"] },
  { cle: "RevFwd3", pilier: "Growth", poids: 20, sens: "H",
    entetes: ["CA fwd 3a (%)", "Revenue Forward 3Y CAGR", "Revenue Forward 3Y"] },
  { cle: "LevFCF5", pilier: "Growth", poids: 15, sens: "H",
    entetes: ["FCF CAGR 5a (%)", "Levered FCF 5Y CAGR", "FCF 5Y CAGR",
              "Levered Free Cash Flow 5Y CAGR"] },
  { cle: "NI5", pilier: "Growth", poids: 10, sens: "H",
    entetes: ["Res.net CAGR 5a (%)", "Net Income 5Y CAGR", "Net Income 5Y"] },
  // derivees : CAGR de la metrique corrige du CAGR du nombre d'actions
  { cle: "RevPS5", pilier: "Growth", poids: 15, sens: "H", entetes: [] },
  { cle: "FCFPS5", pilier: "Growth", poids: 25, sens: "H", entetes: [] },

  // ---- VALUE ----
  { cle: "EV_EBIT", pilier: "Value", poids: 35, sens: "L",
    entetes: ["EV/EBIT", "EV / EBIT"] },
  { cle: "EV_FCF", pilier: "Value", poids: 15, sens: "L",
    entetes: ["EV/FCF", "EV / FCF"] },
  { cle: "FwdP_FCF", pilier: "Value", poids: 25, sens: "L",
    entetes: ["P/FCF fwd", "Forward P/FCF", "P/FCF forward"] },
  { cle: "FCFYield", pilier: "Value", poids: 25, sens: "H",
    entetes: ["FCF Yield (%)", "FCF Yield", "FCF Yield %"] },
];

// ---------------------------------------------------------------------
// 3) Colonnes d'identification / de reference
// ---------------------------------------------------------------------
export const COLONNE_TICKER = ["Ticker", "Symbole", "Symbol"];
export const COLONNE_SECTEUR = ["Secteur", "Sector"];
export const COLONNE_CAP = ["Cap. boursiere ($Md)", "Market Cap", "Cap boursiere", "MarketCap"];

export const COLONNES_REFERENCE = [
  { cle: "PEG", entetes: ["PEG (ref.)", "PEG", "PEG Ratio"] },
  { cle: "OCF", entetes: ["OCF ($Md)", "OCF", "Cash from Operations", "Operating Cash Flow"] },
  { cle: "Capex", entetes: ["Capex ($Md)", "Capex", "Capital Expenditure", "Capital Expenditures"] },
];

// ---------------------------------------------------------------------
// 4) Winsorisation et plafonds economiques
// ---------------------------------------------------------------------
export const WINSOR_BAS = 2.5;
export const WINSOR_HAUT = 97.5;

// Au-dela de ces valeurs, "plus haut" n'est plus "meilleur".
export const PLAFONDS = {
  FCF_NI: 130,     // conversion de cash plafonnee a 130 %
  OCF_Capex: 15,   // couverture du capex plafonnee a 15x
  EBITInt: 40,     // couverture d'interets plafonnee a 40x
};

// ---------------------------------------------------------------------
// 4bis) Reglages "v3"
// ---------------------------------------------------------------------
export const NOMS_METRIQUES = {
  ROIC: "ROIC", ROIC5: "ROIC 5y", OpM: "Operating margin",
  FCFM5: "FCF margin 5y", FCF_NI: "FCF/Net income conv.", GM5: "Gross margin",
  ShOut5: "Low dilution", SBC: "Low SBC/Revenue",
  NetDebtEBITDA: "Low leverage", EBITInt: "Interest coverage",
  CurrentRatio: "Current ratio", LTDebtAssets: "Low LT debt",
  OCF_Capex: "Capex coverage",
  Rev5: "Revenue growth 5y", RevFwd3: "Fwd revenue growth", LevFCF5: "FCF growth 5y",
  NI5: "Net income growth 5y",
  RevPS5: "Revenue/share growth 5y", FCFPS5: "FCF/share growth 5y",
  EV_EBIT: "Attractive EV/EBIT", EV_FCF: "Attractive EV/FCF",
  FwdP_FCF: "Attractive P/FCF fwd", FCFYield: "FCF yield",
};

export const DESCRIPTIONS_METRIQUES = {
  ROIC: "Return on invested capital: after-tax profit per $ of capital deployed. Core quality marker.",
  ROIC5: "5-year average ROIC: shows whether high returns are durable, not a one-off.",
  OpM: "Operating margin: operating profit / revenue. Pricing power and cost discipline.",
  FCFM5: "5-year average free-cash-flow margin: FCF / revenue. How much cash the model throws off.",
  FCF_NI: "Cash conversion: free cash flow / net income. >100% = earnings are backed by real cash.",
  GM5: "5-year average gross margin (low weight: strongly sector-biased, 100% is often an artefact).",
  ShOut5: "Share count 5y CAGR. Lower/negative = buybacks, no dilution (scored inverted).",
  SBC: "Stock-based comp / revenue. Hidden cost of equity pay; lower is better (scored inverted).",
  NetDebtEBITDA: "Net debt / EBITDA. Balance-sheet leverage; lower is safer (scored inverted).",
  EBITInt: "Interest coverage: EBIT / interest expense. How easily debt interest is paid.",
  CurrentRatio: "Current ratio: current assets / current liabilities. Short-term solvency.",
  LTDebtAssets: "Long-term debt / assets. Structural indebtedness; lower is better (scored inverted).",
  OCF_Capex: "Capex coverage: operating cash flow / capex. >1 = self-funding of investments.",
  Rev5: "Revenue 5-year CAGR. Historical top-line growth.",
  RevFwd3: "Expected revenue 3-year forward CAGR (analyst estimates).",
  LevFCF5: "Levered free cash flow 5-year CAGR. Growth of the cash that actually reaches shareholders.",
  NI5: "Net income 5-year CAGR. Bottom-line growth.",
  RevPS5: "Revenue growth adjusted for changes in share count. How much top-line growth accrues per share.",
  FCFPS5: "FCF growth adjusted for changes in share count. The cash growth that actually accrues per share.",
  EV_EBIT: "EV / EBIT. Enterprise value vs operating profit; lower is cheaper (scored inverted).",
  EV_FCF: "EV / free cash flow. Cheapness on a cash basis; lower is better (scored inverted).",
  FwdP_FCF: "Forward price / free cash flow. Forward-looking cheapness; lower is better (scored inverted).",
  FCFYield: "FCF yield: free cash flow / market cap. Higher = more cash return for the price paid.",
};

// Note-lettre sur le TOTAL (bornes basses, ordre decroissant).
export const GRILLE_NOTES = [
  ["A+", 70], ["A", 62], ["A-", 55],
  ["B+", 50], ["B", 45], ["B-", 40],
  ["C", 33], ["D", 0],
];

export const MALUS_ALERTE = 2.5;
export const SEUIL_COUVERTURE = 0.75;
export const SEUIL_FORCE = 70;
export const SEUIL_FAIBLESSE = 30;
export const NB_FORCES = 3;
export const SECTEUR_MIN = 3;

// ---------------------------------------------------------------------
// 4ter) Marqueur de VALORISATION
// ---------------------------------------------------------------------
export const NIVEAUX_VALUATION = [
  ["Attractive", 66],
  ["Fair", 40],
  ["Expensive", 0],
];

export const SWEET_SPOT_QUALITE = 60;
export const SWEET_SPOT_SANTE = 50;

// ---------------------------------------------------------------------
// 4quater) Scoring mixte relatif + absolu
// ---------------------------------------------------------------------
export const MELANGE_RELATIF = 0.70;
export const MELANGE_ABSOLU = 0.30;
export const PERCENTILE_SECTORIEL = false;

// Ancres absolues : [valeur notee 0, valeur notee 100].
export const ANCRES_ABSOLUES = {
  // Quality
  ROIC: [5, 30], ROIC5: [5, 25], OpM: [5, 40], FCFM5: [0, 35],
  FCF_NI: [50, 110], GM5: [20, 80],
  ShOut5: [3, -3], SBC: [12, 0],
  // Health
  NetDebtEBITDA: [4, 0], EBITInt: [2, 15], CurrentRatio: [0.8, 2.5],
  LTDebtAssets: [0.6, 0], OCF_Capex: [1, 10],
  // Growth
  Rev5: [0, 25], RevFwd3: [0, 20], LevFCF5: [0, 25], NI5: [0, 25],
  RevPS5: [0, 20], FCFPS5: [0, 22],
  // Value
  EV_EBIT: [40, 12], EV_FCF: [50, 15], FwdP_FCF: [45, 15], FCFYield: [1, 7],
};

// Multiples de valorisation : une valeur negative est absurde, jamais "pas chere".
export const NEGATIF_PIRE = new Set(["EV_EBIT", "EV_FCF", "FwdP_FCF"]);

// ---------------------------------------------------------------------
// 5) Regles d'alertes : [libelle, cle, operateur, seuil]
// ---------------------------------------------------------------------
export const REGLES_ALERTES = [
  ["Share dilution", "ShOut5", ">", 0],
  ["SBC/Revenue > 8%", "SBC", ">", 8],
  ["Leverage > 2.5x", "NetDebtEBITDA", ">", 2.5],
  ["EV/FCF > 40 (expensive)", "EV_FCF", ">", 40],
  ["Forward growth < 8%", "RevFwd3", "<", 8],
];

// ---------------------------------------------------------------------
// 6) Secteurs par defaut (equivalent de secteurs.csv)
//    Utilise uniquement si le CSV colle n'a pas de colonne Secteur.
// ---------------------------------------------------------------------
export const SECTEURS_DEFAUT = {
  NVDA: "Semiconductors", AMAT: "Semiconductors", LRCX: "Semiconductors",
  KLAC: "Semiconductors", ASML: "Semiconductors",
  AAPL: "Tech Hardware", ANET: "Tech Hardware",
  MSFT: "Software", ADBE: "Software", NOW: "Software", FTNT: "Software",
  VEEV: "Software", FICO: "Software", DSY: "Software", CSU: "Software",
  GOOGL: "Media", META: "Media",
  V: "Financials", MA: "Financials", MCO: "Financials", CME: "Financials",
  ICE: "Financials", MSCI: "Financials", FDS: "Financials", SPGI: "Financials",
  MORN: "Financials", CBOE: "Financials",
  "NOVO B": "Healthcare", ISRG: "Healthcare",
  BKNG: "Consumer Disc.", "HESA.F": "Consumer Disc.",
  CPRT: "Industrials", FIX: "Industrials",
};
