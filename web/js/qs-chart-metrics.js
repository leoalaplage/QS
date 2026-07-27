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
    // une charge se lit en valeur absolue : certains emetteurs la taguent
    // negativement dans le tableau de flux
    unite: "money", graph: "bar", abs: true,
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
  eps_publie: {
    nom: "Diluted EPS (as reported)", cat: "Income statement",
    unite: "per_share", graph: "line", menu: false,
    // Un montant PAR ACTION ne se reconstitue pas par difference de cumuls :
    // le nombre d'actions bouge d'un trimestre a l'autre, et surtout les
    // splits font que les vieux depots publient l'EPS pre-split quand les
    // recents le retraitent. Chez Apple, differencer donnait -2,92 pour un
    // trimestre publie a 8,67. On ne garde donc que les trimestres publies
    // tels quels, quitte a en avoir moins.
    nonAdditif: true,
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

  // ---- Briques de bilan (non listees au menu, utilisees par les ratios) ----
  //  Chaque brique regroupe des tags EQUIVALENTS : le premier disponible
  //  gagne, on ne les additionne jamais entre eux. Additionner
  //  « DebtCurrent » et « LongTermDebtCurrent » comptait deux fois la meme
  //  dette chez la plupart des emetteurs.
  dette_ct_totale: {
    nom: "Current debt (aggregate)", cat: "Balance sheet",
    unite: "money", graph: "line", menu: false,
    tags: [[G, "DebtCurrent"]] },
  dette_lt_courante: {
    nom: "Current portion of long-term debt", cat: "Balance sheet",
    unite: "money", graph: "line", menu: false,
    tags: [[G, "LongTermDebtCurrent"]] },
  emprunts_ct: {
    nom: "Short-term borrowings", cat: "Balance sheet",
    unite: "money", graph: "line", menu: false,
    tags: [[G, "ShortTermBorrowings"], [G, "OtherShortTermBorrowings"]] },
  billets_tresorerie: {
    nom: "Commercial paper", cat: "Balance sheet",
    unite: "money", graph: "line", menu: false,
    tags: [[G, "CommercialPaper"]] },
  effets_payer: {
    nom: "Notes payable", cat: "Balance sheet",
    unite: "money", graph: "line", menu: false,
    tags: [[G, "NotesPayableCurrent"]] },
  loyer_fin_ct: {
    nom: "Finance lease liability, current", cat: "Balance sheet",
    unite: "money", graph: "line", menu: false,
    tags: [[G, "FinanceLeaseLiabilityCurrent"]] },
  loyer_fin_lt: {
    nom: "Finance lease liability, non-current", cat: "Balance sheet",
    unite: "money", graph: "line", menu: false,
    tags: [[G, "FinanceLeaseLiabilityNoncurrent"]] },
  placements_ct: {
    nom: "Short-term investments", cat: "Balance sheet",
    unite: "money", graph: "line", menu: false,
    tags: [[G, "ShortTermInvestments"], [G, "MarketableSecuritiesCurrent"],
           [G, "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
           [I, "OtherCurrentFinancialAssets"]] },
  capitaux_avec_mi: {
    nom: "Equity including non-controlling interests", cat: "Balance sheet",
    unite: "money", graph: "line", menu: false,
    tags: [[G, "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
           [I, "Equity"]] },
  actions_preferentielles: {
    nom: "Preferred stock", cat: "Balance sheet",
    unite: "money", graph: "line", menu: false,
    tags: [[G, "PreferredStockValue"]] },
  interets_minoritaires: {
    nom: "Non-controlling interests", cat: "Balance sheet",
    unite: "money", graph: "line", menu: false,
    tags: [[G, "MinorityInterest"], [I, "NoncontrollingInterests"]] },

  // ---- Actions ----
  actions_circulation: {
    nom: "Shares outstanding", cat: "Shares",
    unite: "shares", graph: "line",
    // Photo a une date, et non moyenne sur la periode : c'est ce qu'il faut
    // pour une capitalisation, qui se lit a un instant precis.
    nonAdditif: true, ttmPonctuel: true,
    //  On n'utilise SURTOUT PAS CommonStockSharesIssued : il compte les
    //  actions auto-detenues. Chez Fair Isaac il vaut 3,73 fois le nombre
    //  d'actions reellement en circulation.
    tags: [[G, "CommonStockSharesOutstanding"],
           ["dei", "EntityCommonStockSharesOutstanding"],
           [I, "NumberOfSharesOutstanding"]] },
  shares_diluted: {
    nom: "Diluted share count", cat: "Shares",
    unite: "shares", graph: "line",
    // Une moyenne ponderee d'actions ne s'additionne pas : soustraire le
    // cumul 9 mois du cumul annuel laisse un residu minuscule, et l'EPS
    // calcule dessus explosait a -584. On ne garde que les trimestres publies.
    nonAdditif: true,
    // En TTM on ne SOMME pas un nombre d'actions : on prend la derniere
    // valeur connue, comme pour un poste de bilan.
    ttmPonctuel: true,
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

// =====================================================================
//  Briques communes aux ratios de rentabilite
// =====================================================================
/** Valeur d'une serie a une periode, 0 si absente. Pour les postes optionnels. */
const ou0 = (serie, k) => {
  const v = serie ? serie[k] : null;
  return v === null || v === undefined || !isFinite(v) ? 0 : v;
};

/** Valeur d'une serie, null si absente. Pour les postes obligatoires. */
const ouNull = (serie, k) => {
  const v = serie ? serie[k] : null;
  return v === null || v === undefined || !isFinite(v) ? null : v;
};

/**
 * Cle de la periode situee un AN plus tot : la periode precedente en annuel,
 * quatre trimestres en arriere sinon. Sert aux moyennes de bilan.
 */
function cleAnPrecedent(k) {
  const m = String(k).match(/^(\d{4})Q([1-4])$/);
  if (m) {
    const an = Number(m[1]), q = Number(m[2]);
    return `${an - 1}Q${q}`;
  }
  const an = Number(k);
  return isFinite(an) ? String(an - 1) : null;
}

/**
 * Un denominateur de rentabilite a-t-il encore un sens ?
 *
 * Une societe qui a rachete plus que ses fonds propres comptables affiche un
 * ROE de 22 574 % (Booking 2023) ou un ROIC de 1 143 % (Veeva 2013). Ces
 * nombres sont arithmetiquement exacts et economiquement vides : ils
 * mesurent la petitesse du denominateur, pas la rentabilite.
 *
 * Le critere retenu est economique et non un plafond d'affichage : un socle
 * inferieur a 1 % du bilan n'est plus une base de capital.
 */
const socleUtilisable = (socle, actifs, k) => {
  if (socle === null || socle <= 0) return false;
  const actif = ouNull(actifs, k);
  return actif === null || actif <= 0 ? true : socle >= actif * 0.01;
};

/**
 * Moyenne d'un poste de bilan sur un an. Un ratio qui divise un FLUX (gagne
 * tout au long de la periode) par un STOCK (photo a un instant) surestime le
 * rendement des que le bilan grossit. La moyenne des deux bornes corrige
 * l'essentiel du biais ; a defaut d'anteriorite on garde la valeur courante.
 */
function moyenneBilan(valeurCourante, serie, k) {
  const precedent = ouNull(serie, cleAnPrecedent(k));
  return precedent === null ? valeurCourante : (valeurCourante + precedent) / 2;
}

/**
 * Dette PORTANT INTERET, sans double compte.
 *
 * Le piege : « DebtCurrent » est deja l'agregat de la part courante de la
 * dette long terme, des billets de tresorerie et des emprunts court terme.
 * L'additionner a ses composants comptait la meme dette deux fois. On prend
 * donc l'agregat quand il existe, ses composants sinon. Meme logique pour
 * les emprunts court terme, dont les billets de tresorerie et les effets a
 * payer sont des sous-ensembles chez la plupart des emetteurs.
 */
function detteFinanciere(s, k) {
  const nonCourante = ouNull(s.lt_debt, k) ?? 0;

  let courante = ouNull(s.dette_ct_totale, k);
  if (courante === null) {
    const emprunts = ouNull(s.emprunts_ct, k)
      ?? (ou0(s.billets_tresorerie, k) + ou0(s.effets_payer, k));
    courante = ou0(s.dette_lt_courante, k) + emprunts;
  }

  const locations = ou0(s.loyer_fin_ct, k) + ou0(s.loyer_fin_lt, k);
  return nonCourante + courante + locations;
}

/** Tresorerie et quasi-tresorerie : liquidites + placements a court terme. */
const tresorerieTotale = (s, k) => ou0(s.cash, k) + ou0(s.placements_ct, k);

/**
 * Capital investi, et le detail qui a servi a le calculer.
 * Renvoie null si un poste obligatoire manque ou si le capital est negatif.
 */
function capitalInvesti(s, k) {
  // Les capitaux propres part du groupe d'abord ; a defaut la variante qui
  // INCLUT deja les minoritaires -- auquel cas on ne les rajoute pas.
  let capitaux = ouNull(s.equity, k);
  let minoritairesDejaDedans = false;
  if (capitaux === null) {
    capitaux = ouNull(s.capitaux_avec_mi, k);
    minoritairesDejaDedans = true;
  }
  if (capitaux === null) return null;

  const ic = capitaux
    + detteFinanciere(s, k)
    + ou0(s.actions_preferentielles, k)
    + (minoritairesDejaDedans ? 0 : ou0(s.interets_minoritaires, k))
    - tresorerieTotale(s, k);

  return ic > 0 ? ic : null;
}

const TAUX_NORMALISE = 0.21;

/** Capital investi de toutes les periodes disponibles, pour les moyennes. */
function serieCapital(s) {
  const out = {};
  for (const k of Object.keys(s.equity || s.capitaux_avec_mi || {})) {
    const ic = capitalInvesti(s, k);
    if (ic !== null) out[k] = ic;
  }
  return out;
}

export const DERIVE = {
  /**
   * EPS dilue. On privilegie toujours le chiffre PUBLIE ; on ne calcule que
   * les trimestres absents.
   *
   * Pourquoi ne pas reconstituer par difference de cumuls, comme pour les
   * autres flux : un montant par action n'est pas additif et surtout les
   * splits retraitent l'historique. Chez Apple, la difference donnait -2,92
   * pour un trimestre publie a 8,67. Le resultat net et le nombre d'actions,
   * eux, ne sont pas affectes par ce probleme : leur rapport redonne l'EPS
   * du trimestre manquant -- typiquement le 4e trimestre fiscal, que les
   * societes ne publient jamais isolement.
   */
  eps_diluted: {
    nom: "Diluted EPS", cat: "Income statement",
    unite: "per_share", graph: "line",
    formule: "Reported diluted EPS; missing quarters = net income / diluted share count",
    note: "The reported figure always wins. A computed quarter is only used where the company "
      + "publishes none — in practice the fourth fiscal quarter.",
    // Le TTM se calcule sur la serie TRIMESTRIELLE finale (somme glissante
    // de 4 trimestres d'EPS), et non a partir de composants deja en TTM :
    // sinon le denominateur serait un nombre d'actions quadruple.
    ttmDepuisTrimestres: true,
    besoins: ["eps_publie", "net_income", "shares_diluted"],
    calc: (s) => {
      const out = { ...s.eps_publie };
      const clesActions = Object.keys(s.shares_diluted).sort();
      if (!clesActions.length) return out;
      // Le nombre d'actions du trimestre manquant n'est pas toujours publie
      // non plus : on prend celui de la periode la plus proche. Un compte
      // d'actions bouge de quelques pourcents par an, l'approximation est
      // sans commune mesure avec l'erreur qu'elle evite.
      const rang = (k) => {
        const m = String(k).match(/^(\d{4})Q([1-4])$/);
        return m ? Number(m[1]) * 4 + Number(m[2]) : Number(k) * 4;
      };
      for (const k of Object.keys(s.net_income)) {
        if (k in out) continue;
        let proche = null, ecart = Infinity;
        for (const c of clesActions) {
          const d = Math.abs(rang(c) - rang(k));
          if (d < ecart) { ecart = d; proche = c; }
        }
        // au-dela d'un an d'ecart, l'approximation ne vaut plus rien
        if (proche && ecart <= 4 && s.shares_diluted[proche]) {
          out[k] = s.net_income[k] / s.shares_diluted[proche];
        }
      }
      return out;
    } },
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
    formule: "Net income / average shareholders' equity x 100",
    note: "Equity is averaged over one year. Dividing a flow earned across the period by a "
      + "single end-of-period snapshot overstates the return of any company whose balance "
      + "sheet is growing.",
    unite: "pct", graph: "line", besoins: ["net_income", "equity", "assets"],
    calc: (s) => {
      const r = {};
      for (const k of Object.keys(s.net_income)) {
        const ni = ouNull(s.net_income, k), eq = ouNull(s.equity, k);
        if (ni === null || eq === null) continue;
        const moyen = moyenneBilan(eq, s.equity, k);
        if (socleUtilisable(moyen, s.assets, k)) r[k] = (ni / moyen) * 100;
      }
      return r;
    } },
  roa: {
    nom: "ROA (%)", cat: "Margins & returns",
    formule: "Net income / average total assets x 100",
    note: "Assets are averaged over one year, for the same reason as ROE.",
    unite: "pct", graph: "line", besoins: ["net_income", "assets"],
    calc: (s) => {
      const r = {};
      for (const k of Object.keys(s.net_income)) {
        const ni = ouNull(s.net_income, k), ac = ouNull(s.assets, k);
        if (ni === null || ac === null) continue;
        const moyen = moyenneBilan(ac, s.assets, k);
        if (moyen > 0) r[k] = (ni / moyen) * 100;
      }
      return r;
    } },
  /**
   * ROIC normalise, concu pour etre COMPARABLE entre societes et dans le
   * temps -- et non pour reproduire le chiffre publie par une societe.
   *
   *   ROIC = NOPAT / capital investi MOYEN
   *   NOPAT = resultat operationnel x (1 - 21 %)
   *   capital investi = capitaux propres + dette portant interet
   *                     + actions preferentielles + interets minoritaires
   *                     - tresorerie et placements court terme
   *
   * Le taux d'impot est volontairement FORFAITAIRE a 21 %. Utiliser le taux
   * effectif ferait bouger le ratio au gre des credits d'impot, des rapatri-
   * ements exceptionnels et des changements de perimetre, alors qu'on cherche
   * a mesurer la rentabilite de l'outil economique.
   *
   * Le capital investi est MOYENNE sur un an : le numerateur est un flux
   * gagne tout au long de la periode, le denominateur une photo de fin. Sans
   * moyenne, toute societe dont le bilan grossit voit son ROIC surestime.
   *
   * Renvoie null si le resultat operationnel ou les capitaux propres
   * manquent, ou si le capital investi est nul ou negatif. Les postes
   * optionnels absents valent zero.
   */
  roic: {
    nom: "ROIC (%)", cat: "Margins & returns",
    unite: "pct", graph: "line",
    formule: "Operating income x (1 - 21%) / average invested capital x 100",
    note: "Flat 21% tax rate for every company, and invested capital averaged over one year. "
      + "A comparison metric, not the company's own reported ROIC. Invested capital = equity "
      + "+ interest-bearing debt + preferred + minorities - cash and short-term investments.",
    besoins: ["operating_income", "equity", "capitaux_avec_mi", "lt_debt", "dette_ct_totale",
      "dette_lt_courante", "emprunts_ct", "billets_tresorerie", "effets_payer",
      "loyer_fin_ct", "loyer_fin_lt", "cash", "placements_ct",
      "actions_preferentielles", "interets_minoritaires", "assets"],
    calc: (s) => {
      const r = {};
      for (const k of Object.keys(s.operating_income)) {
        const ebit = ouNull(s.operating_income, k);
        if (ebit === null) continue;
        const ic = capitalInvesti(s, k);
        if (ic === null) continue;
        const icMoyen = moyenneBilan(ic, { ...serieCapital(s), [k]: ic }, k);
        if (!socleUtilisable(icMoyen, s.assets, k)) continue;
        r[k] = (ebit * (1 - TAUX_NORMALISE)) / icMoyen * 100;
      }
      return r;
    } },

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
    formule: "Net income / average shareholders' equity x 100",
    note: "Equity is averaged over one year. Dividing a flow earned across the period by a "
      + "single end-of-period snapshot overstates the return of any company whose balance "
      + "sheet is growing.",
    unite: "pct", graph: "line", besoins: ["net_income", "equity", "assets"],
    calc: (s) => {
      const r = {};
      for (const k of Object.keys(s.net_income)) {
        const ni = ouNull(s.net_income, k), eq = ouNull(s.equity, k);
        if (ni === null || eq === null) continue;
        const moyen = moyenneBilan(eq, s.equity, k);
        if (socleUtilisable(moyen, s.assets, k)) r[k] = (ni / moyen) * 100;
      }
      return r;
    } },
  roa: {
    nom: "ROA (%)", cat: "Margins & returns",
    formule: "Net income / average total assets x 100",
    note: "Assets are averaged over one year, for the same reason as ROE.",
    unite: "pct", graph: "line", besoins: ["net_income", "assets"],
    calc: (s) => {
      const r = {};
      for (const k of Object.keys(s.net_income)) {
        const ni = ouNull(s.net_income, k), ac = ouNull(s.assets, k);
        if (ni === null || ac === null) continue;
        const moyen = moyenneBilan(ac, s.assets, k);
        if (moyen > 0) r[k] = (ni / moyen) * 100;
      }
      return r;
    } },
  sbc_revenue: {
    nom: "SBC / revenue (%)", cat: "Margins & returns",
    formule: "Stock-based compensation / revenue × 100",
    unite: "pct", graph: "line", besoins: ["sbc", "revenue"],
    calc: (s) => ratioPct(s.sbc, s.revenue) },
  fcf_conversion: {
    nom: "FCF / net income conversion (%)", cat: "Margins & returns",
    formule: "(Operating cash flow - capex) / net income x 100",
    note: "Above 100% means earnings are more than covered by real cash. Undefined when net "
      + "income is negative or near zero: dividing by a vanishing denominator produced readings "
      + "of 1550% that meant nothing. Those periods are dropped.",
    unite: "pct", graph: "line", besoins: ["fcf", "net_income", "revenue"],
    calc: (s) => {
      const r = {};
      for (const k of Object.keys(s.fcf)) {
        const ni = ouNull(s.net_income, k), f = ouNull(s.fcf, k);
        if (ni === null || f === null || ni <= 0) continue;
        // un resultat net negligeable devant l'activite fait exploser le ratio
        const ca = ouNull(s.revenue, k);
        if (ca && ni / ca < 0.02) continue;
        r[k] = (f / ni) * 100;
      }
      return r;
    } },
  effective_tax: {
    nom: "Effective tax rate (%)", cat: "Margins & returns",
    formule: "Income tax expense / pre-tax income x 100",
    note: "Only computed on a positive pre-tax income, and only kept between -50% and 100%. "
      + "A loss-making year or a one-off credit produced rates of 454% or -119%, which describe "
      + "an accounting event rather than a tax burden.",
    unite: "pct", graph: "line", besoins: ["income_tax", "pretax_income"],
    calc: (s) => {
      const r = {};
      for (const k of Object.keys(s.pretax_income)) {
        const av = ouNull(s.pretax_income, k), im = ouNull(s.income_tax, k);
        if (av === null || im === null || av <= 0) continue;
        const taux = (im / av) * 100;
        if (taux >= -50 && taux <= 100) r[k] = taux;
      }
      return r;
    } },
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
    note: "Undefined without a real interest charge. A company with almost no debt printed "
      + "coverage ratios of 15,000x, which says nothing beyond \"no debt\"; the ratio is capped "
      + "at 100x, a level above which solvency is no longer the question.",
    unite: "ratio", graph: "line", besoins: ["operating_income", "interest_expense"],
    calc: (s) => {
      const r = {};
      for (const k of Object.keys(s.operating_income)) {
        const ebit = ouNull(s.operating_income, k), inte = ouNull(s.interest_expense, k);
        if (ebit === null || inte === null || inte <= 0) continue;
        r[k] = Math.min(ebit / inte, 100);
      }
      return r;
    } },
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
