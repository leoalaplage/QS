// =====================================================================
//  QS Chart - Acces aux donnees EDGAR et extraction des series
//  Etend qs_chart.py : en plus de l'annuel, on sait produire du
//  TRIMESTRIEL et du TTM, et on accepte toutes les devises (les
//  deposants etrangers comme ASML publient en EUR).
//
//  Regle de conduite : on n'invente jamais un chiffre. Chaque serie est
//  accompagnee d'un rapport (tag utilise, devise, formulaires source,
//  valeurs derivees, controles de coherence) que l'interface affiche.
// =====================================================================

import { BASE, DERIVE } from "./qs-chart-metrics.js";
import { workerUrl } from "./qs-settings.js";

export const MODES = { ANNUEL: "annuel", TRIMESTRE: "trimestre", TTM: "ttm" };

export const LIBELLES_MODES = {
  [MODES.ANNUEL]: "Annual",
  [MODES.TRIMESTRE]: "Quarterly",
  [MODES.TTM]: "TTM (trailing twelve months)",
};

/** Forme courte, pour les phrases (« no data in TTM for ... »). */
export const LIBELLES_COURTS = {
  [MODES.ANNUEL]: "annual",
  [MODES.TRIMESTRE]: "quarterly",
  [MODES.TTM]: "TTM",
};

// Formes de rapports periodiques : signal de fiabilite, pas un filtre exclusif.
const FORMES_ANNUELLES = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const FORMES_TRIMESTRIELLES = new Set(["10-Q", "10-Q/A"]);

// Frames canoniques SEC : CY2023 = annee civile, CY2023Q3 = trimestre civil,
// CY2023Q4I = photo de fin d'annee.
const RE_FRAME_ANNEE = /^CY\d{4}$/;
const RE_FRAME_TRIMESTRE = /^CY\d{4}Q[1-4]$/;
const RE_FRAME_INSTANT = /^CY\d{4}Q[1-4]I$/;

// Tolerances de duree, en jours
const DUREE_ANNEE = [300, 400];
const DUREE_TRIMESTRE = [80, 100];

export class ErreurWorker extends Error {}

// ---------------------------------------------------------------------
// Reseau (via le relais)
// ---------------------------------------------------------------------
const cacheFacts = new Map();

async function appelWorker(chemin) {
  const base = workerUrl();
  if (!base) {
    throw new ErreurWorker(
      "No EDGAR relay configured yet. Enter your Cloudflare Worker URL " +
      "(the \"EDGAR relay\" button above)."
    );
  }
  let reponse;
  try {
    reponse = await fetch(`${base}${chemin}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new ErreurWorker(
      `Relay ${base} is unreachable. Check the URL and that the Worker is deployed.`
    );
  }
  if (reponse.status === 404) throw new ErreurWorker("EDGAR has no filings for this company (404).");
  if (!reponse.ok) throw new ErreurWorker(`The relay answered ${reponse.status}.`);
  return reponse.json();
}

/** JSON companyfacts de la SEC, mis en cache pour la session. */
export async function chargerFacts(cik) {
  const cle = String(cik);
  if (cacheFacts.has(cle)) return cacheFacts.get(cle);
  const promesse = appelWorker(`/facts/${String(cik).padStart(10, "0")}`);
  cacheFacts.set(cle, promesse);
  try {
    return await promesse;
  } catch (e) {
    cacheFacts.delete(cle);
    throw e;
  }
}

// ---------------------------------------------------------------------
// Table des societes (embarquee : pas d'appel reseau, pas de CORS)
// ---------------------------------------------------------------------
let tableTickers = null;

export async function chargerTickers() {
  if (tableTickers) return tableTickers;
  const r = await fetch(new URL("../data/tickers.json", import.meta.url));
  if (!r.ok) throw new Error("Company table not found (web/data/tickers.json).");
  tableTickers = await r.json();
  return tableTickers;
}

/** Recherche par ticker ou par raison sociale. */
export async function chercherSocietes(requete, limite = 12) {
  const table = await chargerTickers();
  const q = String(requete).trim().toUpperCase();
  if (!q) return [];
  const exacts = [], debutTicker = [], debutNom = [], contient = [];
  for (const [tk, [cik, nom]] of Object.entries(table)) {
    const nomMaj = nom.toUpperCase();
    if (tk === q) exacts.push({ ticker: tk, cik, nom });
    else if (tk.startsWith(q)) debutTicker.push({ ticker: tk, cik, nom });
    else if (nomMaj.startsWith(q)) debutNom.push({ ticker: tk, cik, nom });
    else if (nomMaj.includes(q)) contient.push({ ticker: tk, cik, nom });
    if (exacts.length + debutTicker.length > limite * 4) break;
  }
  return [...exacts, ...debutTicker, ...debutNom, ...contient].slice(0, limite);
}

/** "AAPL, MSFT" -> [{ticker, cik, nom}], + liste des inconnus. */
export async function resoudreTickers(saisie) {
  const table = await chargerTickers();
  const trouves = [], inconnus = [];
  const vus = new Set();
  for (const brut of String(saisie).replace(/;/g, ",").split(",")) {
    const tk = brut.trim().toUpperCase();
    if (!tk || vus.has(tk)) continue;
    vus.add(tk);
    const entree = table[tk];
    if (entree) trouves.push({ ticker: tk, cik: entree[0], nom: entree[1] });
    else inconnus.push(tk);
  }
  return { trouves, inconnus };
}

// ---------------------------------------------------------------------
// Choix de l'unite : USD si dispo, sinon n'importe quelle devise
// ---------------------------------------------------------------------
const RE_DEVISE = /^[A-Z]{3}$/;
const RE_PAR_ACTION = /^[A-Z]{3}\/shares$/;

/**
 * Renvoie {unite, devise} ou null si aucune unite compatible.
 *
 * On retient la devise LA MIEUX COUVERTE, pas l'USD par principe. SAP publie
 * 27 points en EUR et 1 seul en USD (2017), TSMC 26 en TWD contre 9 en USD :
 * preferer l'USD tronquerait silencieusement l'historique. Pour un deposant
 * americain la question ne se pose pas, l'USD est la seule unite presente.
 */
function choisirUnite(unites, typeUnite) {
  const accepte =
    typeUnite === "per_share" ? (u) => RE_PAR_ACTION.test(u)
      : typeUnite === "shares" ? (u) => u === "shares"
        : (u) => RE_DEVISE.test(u);

  const candidats = Object.keys(unites).filter(accepte);
  if (!candidats.length) return null;
  const choisi = candidats.slice().sort((a, b) => {
    const d = unites[b].length - unites[a].length;
    if (d !== 0) return d;
    // a couverture egale, l'USD departage
    return (b.startsWith("USD") ? 1 : 0) - (a.startsWith("USD") ? 1 : 0);
  })[0];
  const devise = choisi === "shares" ? null : choisi.slice(0, 3);
  return { unite: choisi, devise };
}

// ---------------------------------------------------------------------
// Points bruts : deduplication par periode
// ---------------------------------------------------------------------
const jours = (a, b) => (b - a) / 86400000;
const dateDe = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
};

/** Comparaison lexicographique d'un "rang" (booleens puis chaines). */
function cmpRang(a, b) {
  for (let i = 0; i < a.length; i++) {
    const x = typeof a[i] === "boolean" ? (a[i] ? 1 : 0) : a[i];
    const y = typeof b[i] === "boolean" ? (b[i] ? 1 : 0) : b[i];
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * Trie les points d'un tag en trois familles, dedupliquees :
 *   instants  : {cleFin -> {val, fin, form}}         (postes de bilan)
 *   annuels   : [{debut, fin, val, form}]            (periodes ~12 mois)
 *   trimestres: [{debut, fin, val, form}]            (periodes ~3 mois)
 * Pour une meme periode, on garde la meilleure valeur : frame canonique SEC,
 * puis formulaire periodique officiel, puis exercice plein, puis depot recent.
 */
function trierPoints(lignes) {
  const sansDebut = lignes.reduce((n, r) => n + (r.start === undefined ? 1 : 0), 0);
  const instant = sansDebut > lignes.length / 2;

  const meilleurs = new Map();   // cle periode -> {rang, point}
  const garder = (cle, rang, point) => {
    const actuel = meilleurs.get(cle);
    if (!actuel || cmpRang(rang, actuel.rang) > 0) meilleurs.set(cle, { rang, point });
  };

  for (const r of lignes) {
    if (r.val === null || r.val === undefined) continue;
    const fin = dateDe(r.end);
    if (!fin) continue;
    const frame = r.frame || "";
    const forme = r.form || "";

    if (instant) {
      if (r.start !== undefined) continue;
      const rang = [RE_FRAME_INSTANT.test(frame), FORMES_ANNUELLES.has(forme) ||
        FORMES_TRIMESTRIELLES.has(forme), r.filed || ""];
      garder(`I${r.end}`, rang, { type: "instant", fin, val: r.val, forme });
      continue;
    }

    if (r.start === undefined) continue;
    const debut = dateDe(r.start);
    if (!debut) continue;
    const d = jours(debut, fin);

    if (d >= DUREE_ANNEE[0] && d <= DUREE_ANNEE[1]) {
      const rang = [RE_FRAME_ANNEE.test(frame), FORMES_ANNUELLES.has(forme),
        r.fp === "FY", r.filed || ""];
      garder(`A${r.start}_${r.end}`, rang, { type: "annee", debut, fin, val: r.val, forme });
    } else if (d >= DUREE_TRIMESTRE[0] && d <= DUREE_TRIMESTRE[1]) {
      const rang = [RE_FRAME_TRIMESTRE.test(frame),
        FORMES_TRIMESTRIELLES.has(forme) || FORMES_ANNUELLES.has(forme), r.filed || ""];
      garder(`Q${r.start}_${r.end}`, rang, { type: "trimestre", debut, fin, val: r.val, forme });
    }
    // Les cumuls 6 et 9 mois sont conserves a part : ils ne sont ni annuels ni
    // trimestriels, mais ce sont eux qui permettent de reconstituer les
    // trimestres d'un tableau de flux (voir trimestresDiscrets).
    if (d > DUREE_TRIMESTRE[1]) {
      const rang = [false, FORMES_TRIMESTRIELLES.has(forme) || FORMES_ANNUELLES.has(forme),
        r.filed || ""];
      garder(`C${r.start}_${r.end}`, rang, { type: "cumul", debut, fin, val: r.val, forme });
    }
  }

  const tout = [...meilleurs.values()].map((x) => x.point);
  const tri = (a, b) => a.fin - b.fin;
  return {
    instant,
    instants: tout.filter((p) => p.type === "instant").sort(tri),
    annees: tout.filter((p) => p.type === "annee").sort(tri),
    trimestres: tout.filter((p) => p.type === "trimestre").sort(tri),
    // toutes les periodes de flux, cumuls compris
    durees: tout.filter((p) => p.type !== "instant").sort(tri),
  };
}

/**
 * Trimestres DISCRETS, reconstitues a partir de toutes les periodes publiees.
 *
 * C'est le point delicat de tout ce fichier. Les societes americaines
 * publient leur tableau de flux en CUMULE depuis l'ouverture de l'exercice :
 * le 10-Q du 2e trimestre donne 6 mois, celui du 3e donne 9 mois, le 10-K
 * donne 12 mois. Ne garder que les periodes de ~90 jours ne ramenait donc
 * que le PREMIER trimestre fiscal -- d'ou un FCF trimestriel reduit au seul
 * trimestre de Noel chez Apple, et un TTM vide.
 *
 * On regroupe les periodes par date de debut : celles qui partagent un debut
 * sont des cumuls emboites. Le trimestre isole s'obtient par difference entre
 * deux cumuls consecutifs, a condition que l'ecart fasse bien un trimestre.
 *
 * Le compte de resultat, lui, est souvent publie directement par trimestre.
 * Les deux chemins coexistent : la valeur publiee telle quelle l'emporte sur
 * la valeur reconstituee, et quand les deux existent on compare -- un ecart
 * significatif remonte comme incoherence.
 *
 * @returns {Map<string, {val:number, derive:boolean, fin:Date, forme:string}>}
 */
function trimestresDiscrets(durees, rapport, nonAdditif = false) {
  const parDebut = new Map();
  for (const p of durees) {
    const cle = p.debut.getTime();
    if (!parDebut.has(cle)) parDebut.set(cle, []);
    parDebut.get(cle).push(p);
  }

  const out = new Map();
  const poser = (debut, fin, val, derive, forme) => {
    const cle = cleTrimestre(fin, debut);
    const actuel = out.get(cle);
    if (!actuel) { out.set(cle, { val, derive, fin, forme }); return; }
    if (actuel.derive && !derive) {
      // une valeur publiee remplace une valeur reconstituee : on en profite
      // pour verifier que les deux disent la meme chose
      const base = Math.abs(val) || 1;
      if (Math.abs(actuel.val - val) > base * 0.01) {
        rapport.incoherences.push(
          `Quarter ${cle}: the reported figure (${val.toExponential(3)}) and the one ` +
          `reconstructed from cumulative filings (${actuel.val.toExponential(3)}) ` +
          "disagree; the reported figure is used."
        );
      }
      out.set(cle, { val, derive, fin, forme });
    }
  };

  for (const groupe of parDebut.values()) {
    groupe.sort((a, b) => a.fin - b.fin);
    let precedent = null;
    for (const p of groupe) {
      if (!precedent) {
        const d = jours(p.debut, p.fin);
        if (d >= DUREE_TRIMESTRE[0] && d <= DUREE_TRIMESTRE[1]) poser(p.debut, p.fin, p.val, false, p.forme);
      } else if (!nonAdditif) {
        // ecart entre deux cumuls consecutifs = le trimestre qui les separe
        const delta = jours(precedent.fin, p.fin);
        if (delta >= DUREE_TRIMESTRE[0] && delta <= DUREE_TRIMESTRE[1]) {
          poser(precedent.fin, p.fin, p.val - precedent.val, true, p.forme);
        }
      }
      precedent = p;
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Cles de periode : trimestre CIVIL de la date de fin (convention EDGAR)
// ---------------------------------------------------------------------
const trimestreCivil = (d) => Math.floor(d.getUTCMonth() / 3) + 1;
const cleDe = (d) => `${d.getUTCFullYear()}Q${trimestreCivil(d)}`;

/**
 * Trimestre civil d'une PERIODE, determine par son MILIEU et non par sa fin.
 *
 * Les exercices americains se cloturent un samedi proche de la fin de
 * trimestre, parfois un ou deux jours apres : le trimestre de mars 2023
 * d'Apple court du 1er janvier au 1er AVRIL. Le classer sur sa date de fin
 * le renvoyait en Q2, ou il ecrasait le vrai Q2 et laissait Q1 vide -- ce
 * qui supprimait ensuite les quatre points TTM de l'annee. EDGAR lui-meme
 * etiquette cette periode CY2023Q1.
 */
const cleTrimestre = (fin, debut = null) => {
  if (!debut) return cleDe(fin);
  return cleDe(new Date((debut.getTime() + fin.getTime()) / 2));
};

/**
 * Trimestre civil d'un INSTANT (poste de bilan). Meme decalage possible :
 * une photo au 1er avril appartient au trimestre de mars. On recule de deux
 * semaines avant de decider.
 */
const cleInstant = (fin) => cleDe(new Date(fin.getTime() - 14 * 86400000));

/** Coordonnee X et etiquette d'une cle de periode. */
export function decoderCle(cle) {
  const m = String(cle).match(/^(\d{4})Q([1-4])$/);
  if (m) {
    const an = Number(m[1]), q = Number(m[2]);
    return { x: an + (q - 1) / 4, etiquette: `Q${q} ${String(an).slice(2)}`, annee: an, trimestre: q };
  }
  const an = Number(cle);
  return { x: an, etiquette: String(an), annee: an, trimestre: null };
}

// ---------------------------------------------------------------------
// Construction des series par mode
// ---------------------------------------------------------------------
/** Serie annuelle {annee: valeur}. Identique a qs_chart.py. */
function serieAnnuelle(tri, rapport) {
  const serie = {};
  const source = tri.instant ? tri.instants : tri.annees;
  for (const p of source) {
    // instants : on ne garde que les photos de fin d'exercice
    if (tri.instant && !FORMES_ANNUELLES.has(p.forme)) continue;
    serie[p.fin.getUTCFullYear()] = p.val;
    rapport.formes.add(p.forme);
  }
  if (tri.instant && !Object.keys(serie).length) {
    // repli : aucune photo estampillee rapport annuel, on prend le Q4 civil
    for (const p of tri.instants) {
      const c = cleInstant(p.fin);
      if (c.endsWith("Q4")) { serie[parseInt(c, 10)] = p.val; rapport.formes.add(p.forme); }
    }
  }
  return serie;
}

/**
 * Serie trimestrielle {2025Q3: valeur}.
 * Les flux manquants de 4e trimestre sont derives : Q4 = exercice - (Q1+Q2+Q3),
 * uniquement quand les 3 trimestres tombent exactement dans l'exercice.
 */
function serieTrimestrielle(tri, rapport, nonAdditif = false) {
  const serie = {};

  if (tri.instant) {
    for (const p of tri.instants) {
      serie[cleInstant(p.fin)] = p.val;
      rapport.formes.add(p.forme);
    }
    return serie;
  }

  const quarts = trimestresDiscrets(tri.durees, rapport, nonAdditif);
  for (const [cle, q] of quarts) {
    serie[cle] = q.val;
    rapport.formes.add(q.forme);
    if (q.derive) rapport.derives.push(cle);
  }

  // Controle : les 4 trimestres d'un exercice doivent redonner l'annuel publie
  for (const an of tri.annees) {
    const dedans = [...quarts.values()].filter((q) => q.fin > an.debut && q.fin <= an.fin);
    if (dedans.length !== 4) continue;
    const somme = dedans.reduce((a, q) => a + q.val, 0);
    const ecart = an.val - somme;
    // tolerance : 0,5 % de l'exercice (arrondis de publication)
    if (Math.abs(ecart) > Math.abs(an.val) * 0.005) {
      rapport.incoherences.push(
        `Fiscal year ended ${an.fin.toISOString().slice(0, 10)}: the four quarters ` +
        `sum to ${(ecart / Math.abs(an.val) * 100).toFixed(1)}% away from the reported annual total.`
      );
    }
  }
  return serie;
}

/** Somme glissante de 4 trimestres consecutifs sur une serie deja trimestrielle. */
function cumulGlissant(trim) {
  const idx = (c) => { const { annee, trimestre } = decoderCle(c); return annee * 4 + (trimestre - 1); };
  const parIdx = new Map(Object.keys(trim).map((c) => [idx(c), trim[c]]));
  const out = {};
  for (const c of Object.keys(trim)) {
    const i = idx(c);
    const bouts = [parIdx.get(i), parIdx.get(i - 1), parIdx.get(i - 2), parIdx.get(i - 3)];
    if (bouts.some((v) => v === undefined)) continue;
    out[c] = bouts.reduce((a, b) => a + b, 0);
  }
  return out;
}

/**
 * Serie TTM {2025Q3: valeur}.
 *   flux   : somme des 4 trimestres consecutifs se terminant a cette periode ;
 *   bilan  : la valeur ponctuelle du trimestre (un stock ne se cumule pas).
 */
function serieTTM(tri, rapport, nonAdditif = false) {
  const trim = serieTrimestrielle(tri, rapport, nonAdditif);
  if (tri.instant) return trim;   // poste de bilan : TTM = photo la plus recente

  const cles = Object.keys(trim).sort();
  const idx = (c) => { const { annee, trimestre } = decoderCle(c); return annee * 4 + (trimestre - 1); };
  const parIdx = new Map(cles.map((c) => [idx(c), trim[c]]));

  const serie = {};
  for (const c of cles) {
    const i = idx(c);
    const morceaux = [parIdx.get(i), parIdx.get(i - 1), parIdx.get(i - 2), parIdx.get(i - 3)];
    // 4 trimestres CONSECUTIFS exiges : sinon on n'affiche rien pour cette date
    if (morceaux.some((v) => v === undefined)) continue;
    serie[c] = morceaux.reduce((a, b) => a + b, 0);
  }
  return serie;
}

// ---------------------------------------------------------------------
// Series par metrique
// ---------------------------------------------------------------------
/** Rapport vierge de tracabilite pour une metrique. */
function nouveauRapport() {
  return { tags: [], devises: new Set(), formes: new Set(), derives: [], incoherences: [], points: 0 };
}

/** Serie d'une metrique BASE (fusion multi-tags, 1er tag disponible gagne). */
function serieBase(facts, cle, mode, rapport) {
  const d = BASE[cle];
  const racine = facts.facts || {};
  const resultat = {};

  for (const [taxo, tag] of d.tags) {
    const noeud = (racine[taxo] || {})[tag];
    if (!noeud) continue;
    const choix = choisirUnite(noeud.units || {}, d.unite);
    if (!choix) continue;

    const tri = trierPoints(noeud.units[choix.unite]);
    const sousRapport = nouveauRapport();
    const serie = mode === MODES.ANNUEL ? serieAnnuelle(tri, sousRapport)
      : mode === MODES.TRIMESTRE ? serieTrimestrielle(tri, sousRapport, !!d.nonAdditif)
        : d.ttmPonctuel
          ? serieTrimestrielle(tri, sousRapport, !!d.nonAdditif)   // valeur ponctuelle
          : serieTTM(tri, sousRapport, !!d.nonAdditif);

    let ajoutes = 0;
    for (const [k, v] of Object.entries(serie)) {
      if (k in resultat) continue;           // le 1er tag disponible gagne
      resultat[k] = d.abs ? Math.abs(v) : v;
      ajoutes++;
    }
    if (ajoutes) {
      rapport.tags.push({ tag, taxo, unite: choix.unite, points: ajoutes });
      if (choix.devise) rapport.devises.add(choix.devise);
      for (const f of sousRapport.formes) rapport.formes.add(f);
      rapport.derives.push(...sousRapport.derives.filter((c) => c in resultat));
      rapport.incoherences.push(...sousRapport.incoherences);
    }
  }
  return resultat;
}

/** Serie de n'importe quelle metrique (BASE ou DERIVE), avec son rapport. */
export function construireSerie(facts, cle, mode, cache = {}, rapport = null) {
  const rap = rapport || nouveauRapport();
  if (cache[cle]) return cache[cle];

  let serie;
  if (cle in BASE) {
    serie = serieBase(facts, cle, mode, rap);
  } else {
    const d = DERIVE[cle];
    // Certaines derivees doivent etre calculees TRIMESTRE par TRIMESTRE puis
    // cumulees : un rapport dont le denominateur n'est pas additif (l'EPS et
    // son nombre d'actions) serait faux si on le calculait sur des composants
    // deja cumules.
    const modeComposants = (mode === MODES.TTM && d.ttmDepuisTrimestres)
      ? MODES.TRIMESTRE : mode;
    const sous = {};
    for (const b of d.besoins) sous[b] = construireSerie(facts, b, modeComposants, cache, rap);
    serie = d.calc(sous);
    if (mode === MODES.TTM && d.ttmDepuisTrimestres) serie = cumulGlissant(serie);
    // Un ratio qui melangerait deux devises serait faux : on refuse plutot
    // que d'afficher un chiffre qui n'a aucun sens.
    if (rap.devises.size > 1) {
      rap.incoherences.push(
        `Components reported in ${[...rap.devises].join(" and ")}: the ratio would be ` +
        "meaningless, series discarded."
      );
      serie = {};
    }
  }
  rap.points = Object.keys(serie).length;
  cache[cle] = serie;
  return serie;
}

/**
 * Series d'une metrique pour plusieurs societes.
 * @returns {{series, noms, rapports, absents, devises}}
 */
export async function seriesPour(tickers, cleMetrique, mode, surAvancement = () => {}) {
  const series = {}, noms = {}, rapports = {}, absents = [];
  const devises = new Set();

  for (const { ticker, cik, nom } of tickers) {
    surAvancement(`Fetching ${ticker} from EDGAR...`);
    noms[ticker] = nom;
    const facts = await chargerFacts(cik);

    const rapport = nouveauRapport();
    const serie = construireSerie(facts, cleMetrique, mode, {}, rapport);
    rapport.points = Object.keys(serie).length;
    rapports[ticker] = rapport;
    for (const d of rapport.devises) devises.add(d);

    if (rapport.points) series[ticker] = serie;
    else absents.push(ticker);
  }
  return { series, noms, rapports, absents, devises: [...devises] };
}

/**
 * Diagnostic : quels modes sont reellement disponibles pour cette societe ?
 * Sert a expliquer « pas de trimestriel » au lieu d'afficher un graphe vide.
 */
export function modesDisponibles(facts, cleMetrique) {
  const dispo = {};
  for (const mode of Object.values(MODES)) {
    const serie = construireSerie(facts, cleMetrique, mode, {}, nouveauRapport());
    dispo[mode] = Object.keys(serie).length;
  }
  return dispo;
}
