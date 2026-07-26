// =====================================================================
//  QS Chart - Definition des metriques EDGAR
//  Port de BASE / DERIVE de qs_chart.py, etendu a la taxonomie IFRS.
//    BASE   : tirees directement d'un ou plusieurs tags XBRL
//    DERIVE : calculees a partir des series BASE
//
//  Chaque metrique liste ses tags par ordre de preference : d'abord
//  us-gaap (deposants americains), puis ifrs-full (deposants etrangers
//  type Novo Nordisk, SAP, TSMC). Le premier tag qui a une valeur gagne.
//  Les noms IFRS ont ete verifies sur les depots reels -- attention a la
//  casse, IFRS ecrit "Sharebased" et non "ShareBased".
//
//  Le type d'unite (money / pct / ratio / per_share / shares) sert a
//  choisir la bonne unite XBRL : toute devise ISO est acceptee, la mieux
//  couverte l'emporte (voir choisirUnite dans qs-chart-edgar.js).
// =====================================================================

const G = "us-gaap";
const I = "ifrs-full";

export const BASE = {
  // ---- Compte de resultat ----
  revenue: {
    nom: "Revenue", cat: "Income statement",
    unite: "money", graph: "bar",
    tags: [[G, "RevenueFromContractWithCustomerExcludingAssessedTax"],
           [G, "RevenueFromContractWithCustomerIncludingAssessedTax"],
           [G, "Revenues"], [G, "SalesRevenueNet"],
           [I, "Revenue"], [I, "RevenueFromContractsWithCustomers"]] },
  gross_profit: {
    nom: "Gross profit", cat: "Income statement",
    unite: "money", graph: "bar",
    tags: [[G, "GrossProfit"], [I, "GrossProfit"]] },
  operating_income: {
    nom: "Operating income", cat: "Income statement",
    unite: "money", graph: "bar",
    tags: [[G, "OperatingIncomeLoss"], [I, "ProfitLossFromOperatingActivities"]] },
  net_income: {
    nom: "Net income", cat: "Income statement",
    unite: "money", graph: "bar",
    tags: [[G, "NetIncomeLoss"], [G, "ProfitLoss"],
           [G, "NetIncomeLossAvailableToCommonStockholdersBasic"],
           [I, "ProfitLoss"], [I, "ProfitLossAttributableToOwnersOfParent"]] },
  rd: {
    nom: "R&D expense", cat: "Income statement",
    unite: "money", graph: "bar",
    tags: [[G, "ResearchAndDevelopmentExpense"], [I, "ResearchAndDevelopmentExpense"]] },
  interest_expense: {
    nom: "Interest expense", cat: "Income statement",
    unite: "money", graph: "bar", menu: false,
    tags: [[G, "InterestExpense"], [G, "InterestExpenseDebt"],
           [G, "InterestAndDebtExpense"], [I, "FinanceCosts"], [I, "InterestExpense"]] },
  sbc: {
    nom: "Stock-based compensation (SBC)", cat: "Income statement",
    unite: "money", graph: "bar",
    tags: [[G, "ShareBasedCompensation"],
           [G, "AllocatedShareBasedCompensationExpense"],
           [I, "ExpenseFromSharebasedPaymentTransactionsWithEmployees"],
           [I, "AdjustmentsForSharebasedPayments"]] },
  cost_revenue: {
    nom: "Cost of revenue", cat: "Income statement",
    unite: "money", graph: "bar", menu: false,
    tags: [[G, "CostOfRevenue"], [G, "CostOfGoodsAndServicesSold"], [I, "CostOfSales"]] },
  sga: {
    nom: "SG&A expense", cat: "Income statement",
    unite: "money", graph: "bar", menu: false,
    tags: [[G, "SellingGeneralAndAdministrativeExpense"],
           [I, "SellingGeneralAndAdministrativeExpense"]] },
  income_tax: {
    nom: "Income tax expense", cat: "Income statement",
    unite: "money", graph: "bar", menu: false,
    tags: [[G, "IncomeTaxExpenseBenefit"], [I, "IncomeTaxExpenseContinuingOperations"]] },
  pretax_income: {
    nom: "Pre-tax income", cat: "Income statement",
    unite: "money", graph: "bar", menu: false,
    tags: [[G, "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"],
           [G, "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"],
           [I, "ProfitLossBeforeTax"]] },
  eps_diluted: {
    nom: "Diluted EPS", cat: "Income statement",
    unite: "per_share", graph: "line",
    tags: [[G, "EarningsPerShareDiluted"], [G, "EarningsPerShareBasic"],
           [I, "DilutedEarningsLossPerShare"], [I, "BasicEarningsLossPerShare"]] },

  // ---- Cash-flow ----
  ocf: {
    nom: "Operating cash flow (OCF)", cat: "Cash flow",
    unite: "money", graph: "bar",
    tags: [[G, "NetCashProvidedByUsedInOperatingActivities"],
           [G, "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
           [I, "CashFlowsFromUsedInOperatingActivities"]] },
  capex: {
    nom: "Capital expenditure (capex)", cat: "Cash flow", abs: true,
    unite: "money", graph: "bar",
    tags: [[G, "PaymentsToAcquirePropertyPlantAndEquipment"],
           [G, "PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets"],
           [G, "PaymentsToAcquireProductiveAssets"],
           [G, "PaymentsForSoftware"],
           [I, "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
           [I, "PurchaseOfPropertyPlantAndEquipment"]] },
  dividends: {
    nom: "Dividends paid", cat: "Cash flow", abs: true,
    unite: "money", graph: "bar",
    tags: [[G, "PaymentsOfDividendsCommon"],
           [G, "PaymentsOfDividendsCommonStock"],
           [G, "PaymentsOfDividends"],
           [I, "DividendsPaidClassifiedAsFinancingActivities"], [I, "DividendsPaid"]] },
  buybacks: {
    nom: "Share buybacks", cat: "Cash flow", abs: true,
    unite: "money", graph: "bar",
    tags: [[G, "PaymentsForRepurchaseOfCommonStock"],
           [I, "PaymentsToAcquireOrRedeemEntitysShares"]] },
  investing_cf: {
    nom: "Investing cash flow", cat: "Cash flow",
    unite: "money", graph: "bar",
    tags: [[G, "NetCashProvidedByUsedInInvestingActivities"],
           [I, "CashFlowsFromUsedInInvestingActivities"]] },
  financing_cf: {
    nom: "Financing cash flow", cat: "Cash flow",
    unite: "money", graph: "bar",
    tags: [[G, "NetCashProvidedByUsedInFinancingActivities"],
           [I, "CashFlowsFromUsedInFinancingActivities"]] },

  // ---- Bilan ----
  assets: {
    nom: "Total assets", cat: "Balance sheet",
    unite: "money", graph: "bar",
    tags: [[G, "Assets"], [I, "Assets"]] },
  equity: {
    nom: "Shareholders' equity", cat: "Balance sheet",
    unite: "money", graph: "bar",
    tags: [[G, "StockholdersEquity"],
           [G, "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
           [I, "EquityAttributableToOwnersOfParent"], [I, "Equity"]] },
  cash: {
    nom: "Cash & equivalents", cat: "Balance sheet",
    unite: "money", graph: "bar",
    tags: [[G, "CashAndCashEquivalentsAtCarryingValue"],
           [G, "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
           [I, "CashAndCashEquivalents"]] },
  lt_debt: {
    nom: "Long-term debt", cat: "Balance sheet",
    unite: "money", graph: "bar",
    tags: [[G, "LongTermDebtNoncurrent"], [G, "LongTermDebt"],
           [I, "NoncurrentPortionOfNoncurrentBorrowings"], [I, "LongtermBorrowings"]] },
  short_debt: {
    nom: "Short-term debt", cat: "Balance sheet",
    unite: "money", graph: "bar", menu: false,
    tags: [[G, "LongTermDebtCurrent"], [G, "DebtCurrent"],
           [I, "CurrentPortionOfLongtermBorrowings"], [I, "ShorttermBorrowings"]] },
  cur_assets: {
    nom: "Current assets", cat: "Balance sheet",
    unite: "money", graph: "bar", menu: false,
    tags: [[G, "AssetsCurrent"], [I, "CurrentAssets"]] },
  cur_liab: {
    nom: "Current liabilities", cat: "Balance sheet",
    unite: "money", graph: "bar", menu: false,
    tags: [[G, "LiabilitiesCurrent"], [I, "CurrentLiabilities"]] },
  goodwill: {
    nom: "Goodwill", cat: "Balance sheet",
    unite: "money", graph: "bar",
    tags: [[G, "Goodwill"], [I, "Goodwill"]] },
  deferred_revenue: {
    nom: "Deferred revenue", cat: "Balance sheet",
    unite: "money", graph: "bar",
    tags: [[G, "ContractWithCustomerLiabilityCurrent"],
           [G, "ContractWithCustomerLiability"],
           [G, "DeferredRevenueCurrent"],
           [I, "ContractLiabilities"]] },
  rpo: {
    nom: "Remaining performance obligations (RPO)", cat: "Balance sheet",
    unite: "money", graph: "bar",
    tags: [[G, "RevenueRemainingPerformanceObligation"],
           [I, "TransactionPriceAllocatedToRemainingPerformanceObligations"]] },
  retained_earnings: {
    nom: "Retained earnings", cat: "Balance sheet",
    unite: "money", graph: "bar",
    tags: [[G, "RetainedEarningsAccumulatedDeficit"], [I, "RetainedEarnings"]] },

  // ---- Actions ----
  shares_diluted: {
    nom: "Diluted share count", cat: "Shares",
    unite: "shares", graph: "line",
    tags: [[G, "WeightedAverageNumberOfDilutedSharesOutstanding"],
           [G, "WeightedAverageNumberOfSharesOutstandingBasic"],
           [I, "AdjustedWeightedAverageNumberOfOrdinarySharesOutstandingDiluted"],
           [I, "WeightedAverageNumberOfOrdinarySharesOutstandingDiluted"]] },
};

// ---------------------------------------------------------------------
// Helpers de calcul (series = objets {clePeriode: valeur})
// ---------------------------------------------------------------------
const ratioPct = (num, den) => {
  const r = {};
  for (const a of Object.keys(num)) if (den[a]) r[a] = (100.0 * num[a]) / den[a];
  return r;
};

const ratio = (num, den) => {
  const r = {};
  for (const a of Object.keys(num)) if (den[a]) r[a] = num[a] / den[a];
  return r;
};

function detteCapitaux(s) {
  const { lt_debt: ltd, short_debt: std, equity: eq } = s;
  const r = {};
  for (const a of Object.keys(eq)) if (eq[a]) r[a] = ((ltd[a] || 0) + (std[a] || 0)) / eq[a];
  return r;
}

/** ROIC approx. (%) = EBIT x (1 - 21 %) / capital investi. Repere de tendance. */
function roic(s) {
  const op = s.operating_income, eq = s.equity, cash = s.cash;
  const ltd = s.lt_debt, std = s.short_debt;
  const r = {};
  for (const a of Object.keys(op)) {
    if (!(a in eq)) continue;
    const ic = eq[a] + (ltd[a] || 0) + (std[a] || 0) - (cash[a] || 0);
    if (ic > 0) r[a] = (100.0 * op[a] * (1 - 0.21)) / ic;
  }
  return r;
}

export const DERIVE = {
  fcf: {
    nom: "Free cash flow (FCF)", cat: "Cash flow",
    formule: "Operating cash flow − capital expenditure",
    unite: "money", graph: "bar", besoins: ["ocf", "capex"],
    calc: (s) => {
      const r = {};
      for (const a of Object.keys(s.ocf)) if (a in s.capex) r[a] = s.ocf[a] - s.capex[a];
      return r;
    } },
  gross_margin: {
    nom: "Gross margin (%)", cat: "Margins & returns",
    formule: "Gross profit / revenue × 100",
    unite: "pct", graph: "line", besoins: ["gross_profit", "revenue"],
    calc: (s) => ratioPct(s.gross_profit, s.revenue) },
  operating_margin: {
    nom: "Operating margin (%)", cat: "Margins & returns",
    formule: "Operating income / revenue × 100",
    unite: "pct", graph: "line", besoins: ["operating_income", "revenue"],
    calc: (s) => ratioPct(s.operating_income, s.revenue) },
  net_margin: {
    nom: "Net margin (%)", cat: "Margins & returns",
    formule: "Net income / revenue × 100",
    unite: "pct", graph: "line", besoins: ["net_income", "revenue"],
    calc: (s) => ratioPct(s.net_income, s.revenue) },
  fcf_margin: {
    nom: "FCF margin (%)", cat: "Margins & returns",
    formule: "(Operating cash flow − capex) / revenue × 100",
    unite: "pct", graph: "line", besoins: ["fcf", "revenue"],
    calc: (s) => ratioPct(s.fcf, s.revenue) },
  rd_intensity: {
    nom: "R&D intensity (R&D / revenue %)", cat: "Margins & returns",
    formule: "R&D expense / revenue × 100",
    unite: "pct", graph: "line", besoins: ["rd", "revenue"],
    calc: (s) => ratioPct(s.rd, s.revenue) },
  roe: {
    nom: "ROE (%)", cat: "Margins & returns",
    formule: "Net income / shareholders' equity × 100",
    note: "Equity is a balance-sheet item: taken at period end, never averaged.",
    unite: "pct", graph: "line", besoins: ["net_income", "equity"],
    calc: (s) => ratioPct(s.net_income, s.equity) },
  roa: {
    nom: "ROA (%)", cat: "Margins & returns",
    formule: "Net income / total assets × 100",
    note: "Assets are a balance-sheet item: taken at period end, never averaged.",
    unite: "pct", graph: "line", besoins: ["net_income", "assets"],
    calc: (s) => ratioPct(s.net_income, s.assets) },
  roic: {
    nom: "ROIC, approx. (%)", cat: "Margins & returns",
    formule: "Operating income × (1 − 21%) / (equity + total debt − cash) × 100",
    note: "Flat 21% tax rate, not the company's effective rate — a trend marker, not an audited figure.",
    unite: "pct", graph: "line",
    besoins: ["operating_income", "equity", "cash", "lt_debt", "short_debt"],
    calc: roic },
  sbc_revenue: {
    nom: "SBC / revenue (%)", cat: "Margins & returns",
    formule: "Stock-based compensation / revenue × 100",
    unite: "pct", graph: "line", besoins: ["sbc", "revenue"],
    calc: (s) => ratioPct(s.sbc, s.revenue) },
  fcf_conversion: {
    nom: "FCF / net income conversion (%)", cat: "Margins & returns",
    formule: "(Operating cash flow − capex) / net income × 100",
    note: "Above 100% means earnings are more than covered by real cash.",
    unite: "pct", graph: "line", besoins: ["fcf", "net_income"],
    calc: (s) => ratioPct(s.fcf, s.net_income) },
  effective_tax: {
    nom: "Effective tax rate (%)", cat: "Margins & returns",
    formule: "Income tax expense / pre-tax income × 100",
    unite: "pct", graph: "line", besoins: ["income_tax", "pretax_income"],
    calc: (s) => ratioPct(s.income_tax, s.pretax_income) },
  sga_margin: {
    nom: "SG&A / revenue (%)", cat: "Margins & returns",
    formule: "SG&A expense / revenue × 100",
    unite: "pct", graph: "line", besoins: ["sga", "revenue"],
    calc: (s) => ratioPct(s.sga, s.revenue) },

  // ---- Sante & solvabilite ----
  current_ratio: {
    nom: "Current ratio", cat: "Health & solvency",
    formule: "Current assets / current liabilities",
    unite: "ratio", graph: "line", besoins: ["cur_assets", "cur_liab"],
    calc: (s) => ratio(s.cur_assets, s.cur_liab) },
  interest_coverage: {
    nom: "Interest coverage (EBIT / interest)", cat: "Health & solvency",
    formule: "Operating income / interest expense",
    note: "Undefined when interest expense is zero; those periods are dropped.",
    unite: "ratio", graph: "line", besoins: ["operating_income", "interest_expense"],
    calc: (s) => ratio(s.operating_income, s.interest_expense) },
  debt_to_equity: {
    nom: "Debt / equity", cat: "Health & solvency",
    formule: "(Long-term debt + short-term debt) / shareholders' equity",
    note: "Missing debt components count as zero; equity must be non-zero.",
    unite: "ratio", graph: "line", besoins: ["lt_debt", "short_debt", "equity"],
    calc: detteCapitaux },
};

export const CATEGORIES = ["Compte de resultat", "Margins & returns",
  "Sante & solvabilite", "Cash-flow", "Bilan", "Actions"];

/** Dict fusionne {cle: definition} de toutes les metriques. */
export function toutesLesMetriques() {
  return { ...BASE, ...DERIVE };
}

/** Metriques proposees au menu, regroupees par categorie. */
export function metriquesParCategorie() {
  const toutes = toutesLesMetriques();
  const groupes = new Map(CATEGORIES.map((c) => [c, []]));
  for (const [cle, d] of Object.entries(toutes)) {
    if (d.menu === false) continue;
    if (!groupes.has(d.cat)) groupes.set(d.cat, []);
    groupes.get(d.cat).push({ cle, ...d });
  }
  return groupes;
}

/**
 * Quelques valeurs pour demarrer. Ce ne sont que des suggestions : la
 * recherche donne acces aux ~10 400 societes cotees aux Etats-Unis.
 * Tickers verifies dans la table SEC (attention, "DSY" y designe Big Tree
 * Cloud Holdings et surtout pas Dassault Systemes).
 */
export const SUGGESTIONS = [
  "NVDA", "AAPL", "GOOGL", "MSFT", "META", "ASML", "V", "MA", "AMAT",
  "LRCX", "KLAC", "ANET", "NVO", "BKNG", "SPGI", "FTNT", "NOW", "CME",
  "ADBE", "MCO", "ICE", "MSCI", "VEEV", "CBOE", "FICO", "CPRT", "FDS",
  "TSM", "SAP",
];


// ---------------------------------------------------------------------
// Transformations appliquees a une serie avant le trace
// ---------------------------------------------------------------------
export const TRANSFORMATIONS = [
  ["aucune", "None", "Raw values"],
  ["base100", "Rebase to 100", "First visible point = 100, to compare shapes across scales"],
  ["yoy", "Year-on-year %", "Growth versus the same period one year earlier"],
];

/**
 * Applique une transformation a une liste de points {x, etiquette, y}.
 * Renvoie {points, unite} : rebaser ou passer en croissance change l'unite,
 * et donc l'axe sur lequel la serie doit etre graduee.
 */
export function transformer(points, transformation, unite) {
  if (!points.length || transformation === "aucune") return { points, unite };

  if (transformation === "base100") {
    const base = points[0].y;
    if (!base) return { points, unite };
    return {
      points: points.map((p) => ({ ...p, y: (p.y / base) * 100 })),
      unite: "indice",
    };
  }

  if (transformation === "yoy") {
    // « un an avant » = 4 trimestres en arriere, ou 1 an en annuel : dans les
    // deux cas x recule de 1,0 puisque x est exprime en annees decimales.
    const parX = new Map(points.map((p) => [Math.round(p.x * 4), p.y]));
    const out = [];
    for (const p of points) {
      const avant = parX.get(Math.round((p.x - 1) * 4));
      if (avant === undefined || !avant) continue;
      out.push({ ...p, y: ((p.y - avant) / Math.abs(avant)) * 100 });
    }
    return { points: out, unite: "pct" };
  }

  return { points, unite };
}
