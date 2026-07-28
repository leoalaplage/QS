// =====================================================================
//  QS - Regles d'extraction dans les depots, societe par societe
//
//  Ces chiffres ne sont dans AUCUNE taxonomie : ni volumes de paiement,
//  ni transactions traitees, ni ventilation du chiffre d'affaires par
//  nature. Ils vivent dans des tableaux du 10-Q et du communique de
//  resultats, avec une mise en page propre a chaque societe.
//
//  D'ou le cas par cas assume. Chaque regle designe :
//    source   le type de depot ou chercher
//    tableau  ce que le tableau doit contenir pour etre le bon
//    ligne    le libelle de la ligne, une fois ses appels de note retires
//    colonne  le RANG de la valeur parmi les nombres de la ligne
//
//  Le rang plutot que la position brute : le symbole monetaire occupe sa
//  propre cellule sur certaines lignes et pas sur d'autres, si bien que
//  « troisieme cellule » ne veut rien dire, tandis que « troisieme
//  nombre » est stable.
//
//  Une regle qui ne trouve rien ne renvoie RIEN. Elle ne se rabat jamais
//  sur un tableau approchant : mieux vaut un trimestre absent qu'un
//  chiffre pris dans la mauvaise colonne.
// =====================================================================

export const SOCIETES = {
  V: {
    ticker: "V",
    nom: "Visa Inc.",
    cik: 1403161,
    //  Les volumes sont publies avec un TRIMESTRE DE RETARD : le rapport
    //  arrete au 31 mars porte les volumes des trois mois clos le 31
    //  decembre. Chaque tableau declarant sa propre periode, le decalage
    //  se resout tout seul -- rien a coder ici, mais il faut le savoir en
    //  lisant les graphes.
    note: "Payment volumes are reported one quarter in arrears: the report for the quarter "
      + "ended March carries the volumes for the three months ended December. Each series is "
      + "dated from its own table header, so the shift is handled, but a volume point sits one "
      + "quarter before the revenue point of the same filing.",

    series: [
      // ---- Communique de resultats : les indicateurs mis en avant ----
      { cle: "pv_croissance", nom: "Payments volume growth", unite: "pct", groupe: "Key business drivers",
        source: "8-K", tableau: /KEY BUSINESS DRIVERS/i, ligne: /^payments volume$/i, colonne: 0,
        commentaire: "Constant dollars, as the company highlights it" },
      { cle: "pv_croissance_nom", nom: "Payments volume growth (nominal)", unite: "pct", groupe: "Key business drivers",
        source: "8-K", tableau: /KEY BUSINESS DRIVERS/i, ligne: /^payments volume$/i, colonne: 1 },
      { cle: "xb_hors_europe", nom: "Cross-border volume ex intra-Europe", unite: "pct", groupe: "Key business drivers",
        source: "8-K", tableau: /KEY BUSINESS DRIVERS/i,
        ligne: /^cross-border volume excluding intra-europe$/i, colonne: 0 },
      { cle: "xb_total", nom: "Cross-border volume total", unite: "pct", groupe: "Key business drivers",
        source: "8-K", tableau: /KEY BUSINESS DRIVERS/i, ligne: /^cross-border volume total$/i, colonne: 0 },
      { cle: "transactions", nom: "Processed transactions growth", unite: "pct", groupe: "Key business drivers",
        source: "8-K", tableau: /KEY BUSINESS DRIVERS/i, ligne: /^processed transactions$/i, colonne: 0 },

      // ---- 10-Q : volumes nominaux, en milliards ----
      //  Colonnes du tableau : Etats-Unis N, Etats-Unis N-1, International
      //  N, International N-1, Visa N, Visa N-1. Le rang 4 est donc le
      //  total Visa de la periode courante.
      { cle: "vol_credit", nom: "Consumer credit volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-Q", tableau: /Nominal payments volume/i, ligne: /^consumer credit$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_debit", nom: "Consumer debit volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-Q", tableau: /Nominal payments volume/i, ligne: /^consumer debit$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_commercial", nom: "Commercial volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-Q", tableau: /Nominal payments volume/i, ligne: /^commercial$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_paiements", nom: "Total payments volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-Q", tableau: /Nominal payments volume/i, ligne: /^total nominal payments volume$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_cash", nom: "Cash volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-Q", tableau: /Nominal payments volume/i, ligne: /^cash volume$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_total", nom: "Total volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-Q", tableau: /Nominal payments volume/i, ligne: /^total nominal volume$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_us", nom: "U.S. payments volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-Q", tableau: /Nominal payments volume/i, ligne: /^total nominal payments volume$/i, groupes: 3, groupe0: 0, dansGroupe: 0 },
      { cle: "vol_intl", nom: "International payments volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-Q", tableau: /Nominal payments volume/i, ligne: /^total nominal payments volume$/i, groupes: 3, groupe0: 1, dansGroupe: 0 },

      // ---- 10-Q : composantes du chiffre d'affaires, en millions ----
      //  Rang 0 = trimestre courant, 1 = trimestre de l'annee precedente,
      //  2 = variation, puis les memes sur six mois.
      { cle: "rev_service", nom: "Service revenue", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-Q", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^service revenue$/i, colonne: 0 },
      { cle: "rev_data", nom: "Data processing revenue", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-Q", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^data processing revenue$/i, colonne: 0 },
      { cle: "rev_intl", nom: "International transaction revenue", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-Q", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^international transaction revenue$/i, colonne: 0 },
      { cle: "rev_autre", nom: "Other revenue", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-Q", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^other revenue$/i, colonne: 0 },
      { cle: "rev_incitations", nom: "Client incentives", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-Q", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^client incentives$/i, colonne: 0 },
      { cle: "rev_net", nom: "Net revenue", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-Q", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^net revenue$/i, colonne: 0 },

      // ---- Rapport annuel : les MEMES tableaux, sur douze mois ----
      //  Ils ne servent pas a tracer : ils reconstituent, par difference,
      //  le trimestre clos en juin, que Visa ne publie jamais seul --
      //  sans quoi aucune serie de volume n'a quatre trimestres
      //  consecutifs et le cumul glissant est impossible.
      { cle: "vol_credit", nom: "Consumer credit volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-K", tableau: /Nominal payments volume/i, ligne: /^consumer credit$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_debit", nom: "Consumer debit volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-K", tableau: /Nominal payments volume/i, ligne: /^consumer debit$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_commercial", nom: "Commercial volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-K", tableau: /Nominal payments volume/i, ligne: /^commercial$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_paiements", nom: "Total payments volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-K", tableau: /Nominal payments volume/i, ligne: /^total nominal payments volume$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_cash", nom: "Cash volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-K", tableau: /Nominal payments volume/i, ligne: /^cash volume$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_total", nom: "Total volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-K", tableau: /Nominal payments volume/i, ligne: /^total nominal volume$/i, groupes: 3, groupe0: 2, dansGroupe: 0 },
      { cle: "vol_us", nom: "U.S. payments volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-K", tableau: /Nominal payments volume/i, ligne: /^total nominal payments volume$/i, groupes: 3, groupe0: 0, dansGroupe: 0 },
      { cle: "vol_intl", nom: "International payments volume", unite: "money", echelle: 1e9, groupe: "Nominal volume",
        source: "10-K", tableau: /Nominal payments volume/i, ligne: /^total nominal payments volume$/i, groupes: 3, groupe0: 1, dansGroupe: 0 },
      { cle: "rev_service", nom: "Service revenue", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-K", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^service revenue$/i, colonne: 0 },
      { cle: "rev_data", nom: "Data processing revenue", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-K", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^data processing revenue$/i, colonne: 0 },
      { cle: "rev_intl", nom: "International transaction revenue", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-K", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^international transaction revenue$/i, colonne: 0 },
      { cle: "rev_autre", nom: "Other revenue", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-K", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^other revenue$/i, colonne: 0 },
      { cle: "rev_incitations", nom: "Client incentives", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-K", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^client incentives$/i, colonne: 0 },
      { cle: "rev_net", nom: "Net revenue", unite: "money", echelle: 1e6, groupe: "Revenue mix",
        source: "10-K", tableau: /components of our net revenue|Service revenue/i,
        ligne: /^net revenue$/i, colonne: 0 },
    ],
  },
};

export const TICKERS_COUVERTS = Object.keys(SOCIETES);
