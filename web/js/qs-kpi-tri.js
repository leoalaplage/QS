// =====================================================================
//  QS - Tri des KPI decouverts : fusion, classement, mise en avant
//
//  POURQUOI CE MODULE
//  La lecture des communiques (qs-kpi-decouverte.js) ramene tout ce qui
//  ressemble a « libelle + nombre ». Sur un panel reel -- ServiceNow,
//  Booking, Airbnb, Visa, Netflix, Uber -- elle sort 105 series, et
//  seule une minorite a de l'interet. Trois defauts, mesures :
//
//  1. FRAGMENTATION. Le meme indicateur se coupe en plusieurs series
//     parce que la societe change de formulation. Uber ecrit « Trips
//     during the quarter », « Trips on our platform » et « Trips » :
//     trois series de 16, 11 et 3 trimestres au lieu d'une seule. Visa
//     alterne « Data processing revenue » et « revenues ».
//
//  2. DOUBLONS COMPTABLES. « Total revenues », « Net income »,
//     « Operating margin » sont deja dans le menu, tires du XBRL, avec
//     vingt ans d'historique au lieu de quatre et sans dependre d'une
//     tournure de phrase. Les relire dans le texte n'apporte rien.
//
//  3. BRUIT. Des fragments de phrase qui passent la recurrence parce
//     qu'ils reviennent chaque trimestre : « GAAP net income in the
//     fiscal first quarter » (Visa), « YoY and » (Uber), « The balance
//     of the warrants » (Airbnb).
//
//  Ce qui reste apres ces trois passes, c'est ce que la societe publie
//  et qu'on ne trouve nulle part ailleurs : cRPO, Retention Rate, room
//  nights, Gross Bookings, MAPCs, Take Rate, ADR, active listings.
//
//  PRINCIPE DE PRUDENCE
//  Rien n'est supprime en silence. Le bruit est ecarte -- un libelle
//  malforme n'a aucune valeur -- mais les doublons comptables restent
//  accessibles derriere un interrupteur, et chaque fusion est comptee
//  et affichable. Un tri qui se trompe doit pouvoir se constater.
// =====================================================================

export const CAT = { OPS: "ops", FIN: "finance", BRUIT: "bruit" };

// ---------------------------------------------------------------------
// 1. Forme canonique -- sert a reconnaitre deux ecritures du meme KPI
// ---------------------------------------------------------------------

//  Queues temporelles ou locatives : elles decrivent QUAND ou OU, jamais
//  QUOI. « Trips during the quarter » et « Trips » comptent la meme chose.
//
//  Attention a ce qui n'est PAS retire ici : « for the year » reste dans
//  le libelle. En le retirant, « GAAP net income for the quarter » et
//  « ... for the year » se confondaient chez Visa, et 4,1 milliards de
//  benefice trimestriel se retrouvaient fusionnes avec 16 milliards de
//  benefice annuel. Une queue ne se retire que si elle ne change pas la
//  PORTEE du chiffre.
const QUEUES = [
  /\s+(?:booked|reported)$/,
  /\s+(?:during|for|in|within)\s+the\s+(?:quarter|period|three months)$/,
  /\s+on\s+(?:our|the)\s+platform$/,
  /\s+(?:this|last|the)\s+quarter$/,
  /\s+year[\s-]over[\s-]year$/,
  /\s+(?:yoy|y\/y)$/,
  //  reste de subordonnee : « increase in comparable restaurant sales due
  //  to ... » laissait « Comparable restaurant sales due », voisine de la
  //  vraie serie
  /\s+due$/,
  //  base de comparaison de change : ne change pas la nature du chiffre
  /\s+(?:ex[\s-]?fx|ex[\s-]currency|on a constant currency basis|in constant currency)$/,
];

//  Qualificatifs de referentiel comptable. Ils changent la valeur, pas la
//  nature de l'indicateur -- et surtout, on ne veut pas qu'ils empechent
//  de reconnaitre « Adjusted EBITDA » comme une ligne de compte.
const PREFIXES = /^(?:gaap|non[\s-]?gaap|adjusted|normali[sz]ed|underlying|reported|consolidated|total company)\s+/;

/**
 * Singularise une fin de mot, sans toucher aux mots deja singuliers.
 *
 * `brut` est le mot AVANT passage en minuscules : un sigle entierement
 * capitalise garde son S final. Sans cette precaution « EPS » devenait
 * « ep », que plus aucune regle comptable ne reconnaissait -- le
 * benefice par action de Visa se retrouvait classe indicateur
 * operationnel.
 */
function singulier(mot, brut) {
  if (brut && brut === brut.toUpperCase() && /[A-Z]/.test(brut)) return mot;
  if (/(?:ss|us|is)$/.test(mot)) return mot;          // business, status, analysis
  if (/ies$/.test(mot)) return mot.slice(0, -3) + "y"; // deliveries -> delivery
  if (/s$/.test(mot)) return mot.slice(0, -1);         // revenues -> revenue
  return mot;
}

/**
 * Forme canonique d'un libelle : minuscules, ponctuation normalisee,
 * queue temporelle retiree, dernier mot singularise.
 *
 * Deux libelles de meme forme canonique ET de meme unite designent le
 * meme indicateur, et leurs points se rejoignent.
 */
export function canoniser(libelle) {
  //  «  (growth %) » est ajoute a l'affichage quand un meme libelle existe
  //  en niveau et en variation. C'est une decoration, pas une partie du
  //  nom : sans ce retrait, « Revenue (growth %) » n'etait plus reconnu
  //  comme une ligne de compte et passait pour un KPI operationnel.
  let t = libelle.toLowerCase().replace(/\s*\(growth %\)\s*$/, "");
  t = t.replace(/[’']/g, "'").replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  let avant;
  do { avant = t; for (const q of QUEUES) t = t.replace(q, ""); } while (t !== avant);
  const mots = t.split(" ");
  const bruts = libelle.replace(/\s*\(growth %\)\s*$/, "").trim().split(/\s+/);
  mots[mots.length - 1] = singulier(mots[mots.length - 1], bruts[bruts.length - 1]);
  return mots.join(" ").trim();
}

// ---------------------------------------------------------------------
// 2. Bruit -- fragments de phrase deguises en libelles
// ---------------------------------------------------------------------

const BRUIT = [
  //  se termine par un mot de liaison : la phrase a ete coupee en plein
  //  milieu (« GAAP cost of revenue and », « YoY and »)
  /\b(?:and|or|of|in|for|to|the|with|at|by|from|a|an|on|that|as)$/i,
  //  un qualificatif de periode dans le libelle : c'est une phrase, et il
  //  eclate un meme indicateur en quatre series (« GAAP net income in the
  //  fiscal first quarter », « ... second quarter »...)
  /\b(?:fiscal|first|second|third|fourth|full)\s+(?:quarter|year)\b/i,
  /\bin\s+q\b/i,
  //  chiffre de portee ANNUELLE dans une serie trimestrielle : il ne s'y
  //  compare pas et n'a rien a y faire
  /\b(?:for|during) the (?:year|twelve months|full year)\b/i,
  /\byear[\s-]to[\s-]date\b/i,
  //  narration : un KPI ne raconte pas
  /\b(?:results?|figures?)\s+includ/i,
  /^(?:the|a|an|current year|prior year|this year|last year)\b/i,
  /'s\b/,
  /\b(?:balance of|impact of|effect of|portion of|remainder of)\b/i,
  //  restes de titres de tableau
  /^(?:results? and|highlights?|outlook|guidance|summary|note)\b/i,
  //  commence par un marqueur de comparaison : la phrase a ete attrapee
  //  en cours de route (« YoY and monthly Trips per MAPC growth »)
  /^(?:yoy|y\/y|qoq|q\/q|vs\.?|versus)\b/i,
  //  verbe de recit : le motif a mordu sur la phrase qui precede le
  //  libelle (« Adobe achieved record revenue of $5.99 billion »)
  /\b(?:achieved|delivered|posted|generated|recorded|announced|reported|returned|repurchased|grew|reached|surpassed|exceeded)\b/i,
  /^record\b/i,
];

//  Mots trop generiques pour designer quoi que ce soit une fois isoles.
const TROP_VAGUE = new Set(["loss", "gain", "income", "amount", "value", "result",
  "total", "change", "increase", "decrease", "growth", "margin", "rate", "item"]);

export function estBruit(libelle) {
  const c = canoniser(libelle);
  if (c.length < 4) return true;
  if (TROP_VAGUE.has(c)) return true;
  const mots = c.split(" ");
  //  un libelle de plus de huit mots n'est plus un libelle
  if (mots.length > 8) return true;
  //  mot repete : le motif a agrege deux bouts de phrase. Tesla sortait
  //  « Revenue Total revenue » et « Revenue Total quarterly revenue ».
  const pleins = mots.filter((m) => m.length > 3);
  if (new Set(pleins).size < pleins.length) return true;
  return BRUIT.some((re) => re.test(libelle));
}

// ---------------------------------------------------------------------
// 3. Doublons comptables -- deja disponibles en XBRL, en mieux
// ---------------------------------------------------------------------

//  Concepts d'etats financiers, sous forme canonique. La comparaison est
//  EXACTE et non par sous-chaine : « Revenue » est une ligne de compte,
//  « Mobility Revenue » est un chiffre de segment qu'aucun tag ne porte.
//  Une correspondance par sous-chaine confondrait les deux et jetterait
//  precisement ce qu'on cherche a garder.
const CONCEPTS = new Set([
  "revenue", "net revenue", "total revenue", "total net revenue", "gross revenue",
  "sale", "net sale", "total sale", "subscription and support revenue",
  "net income", "net loss", "net earning", "net income attributable to common stockholder",
  "gross profit", "operating income", "operating loss", "income from operation",
  "loss from operation", "income before income taxe", "pretax income",
  "operating expense", "total operating expense", "total expense", "total cost and expense",
  "cost of revenue", "cost of sale", "cost of good sold",
  "research and development", "sales and marketing", "general and administrative",
  "selling general and administrative", "marketing expense",
  "operations and support", "cost of revenue and expense",
  "ebitda loss", "ebitda profit", "unearned fee", "unearned revenue",
  "gross margin", "operating margin", "net margin", "net income margin", "profit margin",
  "ebitda", "ebit", "ebitda margin", "ebit margin",
  "eps", "earning per share", "diluted eps", "diluted earning per share",
  "basic eps", "earning per diluted share", "diluted net income per share",
  "free cash flow", "operating cash flow", "cash flow from operation",
  "cash flow", "net cash provided by operating activitie", "capital expenditure", "capex",
  "tax rate", "effective tax rate", "income tax expense", "provision for income taxe",
  "interest expense", "interest income", "net interest income",
  "depreciation and amortization", "stock-based compensation", "share-based compensation",
  "total asset", "total liabilitie", "stockholder equity", "shareholder equity",
  "long-term debt", "total debt", "net debt", "cash and cash equivalent",
  "deferred revenue", "dividend", "dividend per share", "share repurchase",
  "total share repurchase", "weighted average diluted share", "share outstanding",
  "book value", "gross long-term debt", "gross debt", "net leverage", "leverage ratio",
]);

//  Terminaisons qui suffisent a trancher. Volontairement courtes : pas de
//  « revenue », qui emporterait tous les chiffres de segment.
const QUEUES_COMPTABLES = [
  /\boperating expenses?$/, /\bexpenses?$/, /\bmargin$/, /\btax rate$/,
  /\bcash flow$/, /\beps$/, /\bearnings? per share$/, /\bper diluted share$/,
  /\bincome$/, /\bebitda$/, /\bebit$/,
];

export function estComptable(libelle) {
  const nu = canoniser(libelle).replace(PREFIXES, "").trim();
  if (CONCEPTS.has(nu)) return true;
  return QUEUES_COMPTABLES.some((re) => re.test(nu));
}

// ---------------------------------------------------------------------
// 4. Mise en avant -- le vocabulaire operationnel
// ---------------------------------------------------------------------

//  Ce qu'une societe publie parce que son metier l'exige, et qu'aucune
//  norme comptable ne balise. Sert a ordonner, pas a filtrer : un KPI
//  operationnel qui n'emploie aucun de ces mots reste affiche.
const VOCABULAIRE = new RegExp([
  "retention", "churn", "renewal", "attrition",
  "subscriber", "subscription", "member", "membership", "user", "customer",
  "client", "account", "seat", "licence", "license", "installed base",
  "booking", "bookings", "gmv", "gbv", "gross merchandise", "gross booking",
  "room night", "night", "trip", "ride", "delivery", "deliveries", "order",
  "shipment", "unit", "volume", "transaction", "payment", "swipe",
  "take rate", "attach rate", "arpu", "aov", "adr", "average daily rate",
  "run rate", "arr", "mrr", "annual recurring", "recurring revenue",
  "remaining performance obligation", "rpo", "crpo", "backlog", "bookings growth",
  "mapc", "dau", "mau", "active", "engagement", "usage", "adoption",
  "store", "restaurant", "location", "square feet", "comparable", "same-store",
  "occupancy", "load factor", "utili[sz]ation", "capacity", "yield",
  "listing", "host", "guest", "merchant", "seller", "partner", "supplier",
  "headcount", "employee", "productivity", "net new", "net addition",
  "billing", "invoice", "pipeline", "win rate", "conversion",
].join("|"), "i");

export const estVedette = (libelle) => VOCABULAIRE.test(libelle);

// ---------------------------------------------------------------------
// 5. Fusion des variantes d'ecriture
// ---------------------------------------------------------------------

/**
 * Regroupe les series de meme forme canonique et meme unite.
 *
 * Le libelle affiche est la variante la plus frequente -- celle que la
 * societe emploie le plus souvent est la plus reconnaissable.
 *
 * UNE FUSION QUI SE CONTREDIT EST ABANDONNEE. Si deux variantes donnent
 * des valeurs differentes sur une meme periode, c'est qu'elles ne
 * mesurent pas la meme chose : elles cohabitent dans le meme communique,
 * ou l'une porte sur le trimestre et l'autre sur l'exercice. Le cas s'est
 * presente chez Booking, ou « Room nights » vaut 7 % et 13 % sur la meme
 * periode. Un rapprochement de deux series distinctes coute plus cher
 * qu'un doublon : on les laisse separees.
 *
 * Deux valeurs identiques a 2 % pres sont en revanche la meme mesure
 * ecrite deux fois, et la fusion se fait.
 */
export function fusionner(kpis) {
  const paquets = new Map();
  for (const k of kpis) {
    const cle = `${canoniser(k.nom)}|${k.unite}`;
    if (!paquets.has(cle)) paquets.set(cle, []);
    paquets.get(cle).push(k);
  }

  const sortie = [];
  let fusions = 0, refus = 0;
  for (const [, groupe] of paquets) {
    if (groupe.length === 1) { sortie.push(groupe[0]); continue; }
    //  la variante la mieux fournie donne le nom et sert de reference
    groupe.sort((a, b) => b.points.length - a.points.length);

    const parPeriode = new Map();
    let contradiction = false;
    for (const k of groupe) {
      for (const p of k.points) {
        const deja = parPeriode.get(p.periode);
        if (!deja) { parPeriode.set(p.periode, p); continue; }
        const ecart = Math.abs(deja.valeur - p.valeur) / Math.max(1e-9, Math.abs(deja.valeur));
        if (ecart > 0.02) { contradiction = true; break; }
      }
      if (contradiction) break;
    }

    if (contradiction) { refus++; sortie.push(...groupe); continue; }

    fusions += groupe.length - 1;
    sortie.push({
      ...groupe[0],
      points: [...parPeriode.values()].sort((a, b) => a.periode.localeCompare(b.periode)),
      variantes: [...new Set(groupe.map((k) => k.nom))],
    });
  }
  return { kpis: sortie, fusions, refus };
}

// ---------------------------------------------------------------------
// 6. Passe complete
// ---------------------------------------------------------------------

/**
 * Fusionne puis classe une liste de KPI decouverts.
 *
 * @returns {{ops, finance, bruit, stats}} -- `ops` d'abord les vedettes,
 *   puis par profondeur d'historique.
 */
export function trier(kpis, { minPoints = 3 } = {}) {
  const propres = kpis.filter((k) => !estBruit(k.nom));
  const bruit = kpis.filter((k) => estBruit(k.nom)).map((k) => k.nom);

  const { kpis: fusionnes, fusions, refus } = fusionner(propres);

  const ops = [], finance = [];
  for (const k of fusionnes) {
    if (k.points.length < minPoints) { bruit.push(k.nom); continue; }
    const enrichi = { ...k, vedette: estVedette(k.nom) };
    if (estComptable(k.nom)) finance.push({ ...enrichi, cat: CAT.FIN });
    else ops.push({ ...enrichi, cat: CAT.OPS });
  }

  const ordre = (a, b) => (b.vedette - a.vedette)
    || (b.points.length - a.points.length)
    || a.nom.localeCompare(b.nom);
  ops.sort(ordre);
  finance.sort((a, b) => b.points.length - a.points.length || a.nom.localeCompare(b.nom));

  return {
    ops, finance, bruit,
    stats: { entree: kpis.length, ops: ops.length, finance: finance.length,
      bruit: bruit.length, fusions, refus },
  };
}
