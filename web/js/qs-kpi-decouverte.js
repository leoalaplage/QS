// =====================================================================
//  QS - Decouverte automatique des KPI publies, pour N'IMPORTE QUELLE societe
//
//  LE PROBLEME
//  Les indicateurs qu'une societe met en avant (Retention Rate, room
//  nights, cRPO, Run Rate...) ne sont balises nulle part en XBRL --
//  verifie sur le 10-K d'Airbnb : « Gross Booking Value » est dans le
//  texte, absent du XBRL, y compris des tags d'extension. Ils vivent
//  dans la piece EX-99.1 du 8-K de resultats, en prose.
//
//  L'APPROCHE
//  Ecrire une regle par societe ne passe pas a l'echelle. On lit donc le
//  texte avec des motifs GENERIQUES (« X of 95.3% », « X grew 6% »,
//  « X of $13.20 billion ») qui ne savent rien de la societe, puis on
//  garde ce qui REVIENT d'un trimestre a l'autre.
//
//  C'est la recurrence qui fait le tri. Sur six communiques de MSCI, elle
//  retient « Retention Rate » et « Organic recurring subscription Run Rate
//  growth » (6/6) et ecarte « Consideration consists of a cash payment »
//  (1/6). Un vrai indicateur est publie chaque trimestre ; une phrase de
//  circonstance, non.
//
//  CE QUE CA NE FAIT PAS
//  Aucune comprehension du sens. Un libelle mal decoupe reste un libelle
//  mal decoupe. Chaque valeur garde donc la phrase d'ou elle sort, pour
//  etre verifiable d'un coup d'oeil.
// =====================================================================

import { workerUrl } from "./qs-settings.js";
import { lireEtat, ecrireEtat } from "./qs-etat.js";

const MULT = { billion: 1e9, million: 1e6, trillion: 1e12, thousand: 1e3 };

// Fragment de libelle. Le « \\d? » final absorbe les appels de note de bas
// de page collees au libelle (« Adjusted EBITDA 1 was $105.9 million »).
const LIB = "([A-Z][A-Za-z][A-Za-z &/'\\-]{2,44}?)\\s*\\d?";

/**
 * Motifs generiques. Groupe 1 = libelle, groupe 2 = nombre, groupe 3 = ordre
 * de grandeur eventuel.
 *
 * Il en faut plusieurs parce que la MEME societe change de formulation au
 * fil des annees. Chez MSCI : « Retention Rate of 95.3% » en 2026,
 * « Retention Rate at 94.0% » en 2017, « Operating revenues increased 11.3%
 * to $254.2 million » en 2014. Sans ces variantes, l'historique s'arretait
 * six ans en arriere.
 */
const MOTIFS = [
  // niveaux
  [new RegExp(LIB + " of \\$([\\d,.]+)\\s*(billion|million|trillion)\\b", "g"), "money"],
  [new RegExp(LIB + " (?:was|were|totaled|totalled) \\$([\\d,.]+)\\s*(billion|million|trillion)\\b", "g"), "money"],
  [new RegExp(LIB + " (?:of|at) ([\\d.]+)\\s*%", "g"), "pct"],
  // variations, formulation directe
  [new RegExp(LIB + " (?:grew|increased|rose|was up|declined|decreased|fell)(?: by)? ([\\d.]+)\\s*%", "g"), "pct"],
  // variations, formulation inversee : « 11.7% increase in operating revenues »
  [/([\d.]+)\s*% (?:increase|decrease|growth|decline) in ([a-z][A-Za-z &/'\-]{2,44}?)(?= to | ,|,| for | driven| compared|\.)/g, "pct-inverse"],
];

// Debuts de phrase qui ressemblent a un libelle sans en etre un. Ils
// reviennent d'un trimestre a l'autre, la recurrence ne suffit pas a les
// ecarter.
const NON_LIBELLES = [
  /^the (increase|decrease|change|company|following|table|results?)/i,
  /^(includes?|excludes?|reflects?|represents?|consists?|consideration)/i,
  /^(company|management|we|our|this|these|other|total other)\b/i,
  /^(as of|for the|in the|during|compared|net cash|cash and)/i,
];

const estLibelle = (l) => l.length >= 4 && !NON_LIBELLES.some((re) => re.test(l));

/** HTML -> texte plat. */
export function enTextePlat(html) {
  let t = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  const ent = {
    "&#8220;": '"', "&#8221;": '"', "&#8217;": "'", "&#8216;": "'", "&quot;": '"',
    "&amp;": "&", "&nbsp;": " ", "&#160;": " ", "&#8212;": "-", "&#8211;": "-",
    "&#8226;": " * ", "&#9679;": " * ", "&#59;": ";", "&#39;": "'",
  };
  for (const [k, v] of Object.entries(ent)) t = t.split(k).join(v);
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return t.replace(/\s+/g, " ").trim();
}

/** Tous les couples (libelle, valeur) numeriques d'un communique. */
export function scanner(texte) {
  const trouves = new Map();
  for (const [motif, unite] of MOTIFS) {
    motif.lastIndex = 0;
    let m;
    while ((m = motif.exec(texte)) !== null) {
      // le motif inverse (« 11.7% increase in operating revenues ») porte le
      // nombre en premier et le libelle en second
      const inverse = unite === "pct-inverse";
      const brutLib = inverse ? m[2] : m[1];
      const brutVal = inverse ? m[1] : m[2];
      let libelle = brutLib.replace(/\s+/g, " ").replace(/^[\s,;:*-]+|[\s,;:*-]+$/g, "");
      // les formulations inversees commencent en minuscule : on normalise
      if (inverse) libelle = libelle.charAt(0).toUpperCase() + libelle.slice(1);
      if (!estLibelle(libelle) || trouves.has(libelle)) continue;
      let v = parseFloat(brutVal.replace(/,/g, ""));
      if (!isFinite(v)) continue;
      if (m[3]) v *= MULT[m[3].toLowerCase()] || 1;
      const d = Math.max(0, m.index - 55);
      trouves.set(libelle, { unite: inverse ? "pct" : unite, valeur: v, extrait: texte.slice(d, m.index + m[0].length + 30).trim() });
    }
  }
  return trouves;
}

// ---------------------------------------------------------------------
// Reseau
// ---------------------------------------------------------------------
async function relais(chemin, json = true) {
  const base = workerUrl();
  if (!base) throw new Error("No EDGAR relay configured.");
  const r = await fetch(`${base}${chemin}`);
  if (!r.ok) throw new Error(`Relay answered ${r.status}`);
  return json ? r.json() : r.text();
}

/** Extrait les 8-K de resultats d'un bloc de depots. */
function moissonner(bloc, out, nb) {
  for (let i = 0; i < (bloc.form || []).length && out.length < nb; i++) {
    if (bloc.form[i] !== "8-K" || !String(bloc.items[i] || "").includes("2.02")) continue;
    out.push({
      accession: bloc.accessionNumber[i].replace(/-/g, ""),
      date: bloc.filingDate[i],
      principal: bloc.primaryDocument[i],
    });
  }
}

/**
 * Les `nb` derniers 8-K de resultats.
 *
 * `filings.recent` s'arrete a 1000 depots, ce qui couvre une douzaine
 * d'annees chez une societe active mais pas quinze. Au-dela, la SEC range
 * l'historique dans des fichiers d'archive listes par `filings.files` :
 * on les ouvre, du plus recent au plus ancien, tant qu'il en faut.
 */
async function depotsResultats(cik, nb) {
  const d = await relais(`/submissions/${cik}`);
  const out = [];
  moissonner(d.filings?.recent || {}, out, nb);

  const archives = [...(d.filings?.files || [])]
    .sort((a, b) => String(b.filingTo).localeCompare(String(a.filingTo)));
  for (const fichier of archives) {
    if (out.length >= nb) break;
    try {
      const bloc = await relais(`/submissions-archive/${fichier.name}`);
      // ces fichiers sont des tableaux paralleles, comme `recent`
      moissonner(bloc, out, nb);
    } catch { /* une archive illisible ne doit pas tout arreter */ }
  }
  return out;
}

/** Execute des taches par petits paquets : plus rapide sans saturer la SEC. */
async function parPaquets(items, taille, travail, surAvancement = () => {}) {
  const resultats = [];
  for (let i = 0; i < items.length; i += taille) {
    const lot = items.slice(i, i + taille);
    surAvancement(i + lot.length, items.length);
    resultats.push(...await Promise.all(lot.map(travail)));
  }
  return resultats;
}

/**
 * Le communique dans un depot. Son nom est libre cote SEC
 * (« exhibit991earningsrelease-.htm » chez MSCI, « erq2fy26.htm » chez
 * ServiceNow) : on retient le plus gros .htm qui n'est ni le document
 * principal du 8-K ni un fichier de rendu R*.htm.
 */
async function communique(cik, depot) {
  const idx = await relais(`/archive/${cik}/${depot.accession}/index.json`);
  const items = (idx.directory?.item || []).filter((it) => it.name.endsWith(".htm")
    && it.name !== depot.principal && !/^R\d+\.htm$/.test(it.name));
  if (!items.length) return null;
  items.sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
  return `/archive/${cik}/${depot.accession}/${items[0].name}`;
}

/**
 * Periode couverte par un communique, deduite de sa date de depot.
 * Une societe publie ses resultats 3 a 6 semaines apres la cloture : on
 * recule de 40 jours, ce qui retombe sur le bon trimestre civil.
 */
function periodeDe(dateDepot) {
  const d = new Date(`${dateDepot}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 40);
  return `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

// ---------------------------------------------------------------------
// Decouverte
// ---------------------------------------------------------------------
const CLE_CACHE = "kpi.decouverte";
const PEREMPTION = 7 * 24 * 3600 * 1000;   // une semaine

/**
 * Analyse les derniers communiques d'une societe et renvoie les indicateurs
 * qui reviennent assez souvent pour etre de vrais KPI.
 *
 * @returns {{kpis: Array<{cle,nom,unite,points:[{periode,valeur,extrait,date,accession}]}>,
 *            depots: number, rejetes: Array<string>}}
 */
export async function decouvrir(ticker, cik, { trimestres = 40, minOccurrences = 3,
  surAvancement = () => {}, forcer = false } = {}) {
  const cache = lireEtat(CLE_CACHE, {});
  const enCache = cache[ticker];
  if (!forcer && enCache && Date.now() - enCache.quand < PEREMPTION) return enCache.resultat;

  const depots = await depotsResultats(cik, trimestres);
  const parLibelle = new Map();

  const lus = await parPaquets(depots, 5, async (depot) => {
    try {
      const chemin = await communique(cik, depot);
      if (!chemin) return null;
      return { depot, texte: enTextePlat(await relais(chemin, false)) };
    } catch { return null; }
  }, (fait, total) => surAvancement(`${ticker}: reading earnings releases… ${fait}/${total}`));

  for (const lu of lus) {
    if (!lu) continue;
    for (const [libelle, info] of scanner(lu.texte)) {
      // La cle porte l'UNITE en plus du libelle. Sans ca, « operating
      // revenues » vaut 867 000 000 dollars dans les communiques recents et
      // 11,7 (un pourcentage de croissance) dans ceux de 2012 : les deux
      // atterrissaient dans la meme serie, qui devenait un graphe plat a zero
      // sur la premiere moitie et un CAGR de +265 %. Une serie ne melange
      // jamais deux unites.
      const cle = `${libelle}|${info.unite}`;
      if (!parLibelle.has(cle)) {
        parLibelle.set(cle, { libelle, unite: info.unite, points: [] });
      }
      parLibelle.get(cle).points.push({
        periode: periodeDe(lu.depot.date), valeur: info.valeur,
        extrait: info.extrait, date: lu.depot.date, accession: lu.depot.accession,
      });
    }
  }

  const kpis = [], rejetes = [];
  for (const [cle, d] of parLibelle) {
    if (d.points.length < Math.min(minOccurrences, depots.length)) { rejetes.push(d.libelle); continue; }
    d.points.sort((a, b) => a.periode.localeCompare(b.periode));
    // deux series de meme libelle mais d'unites differentes coexistent :
    // le suffixe dit laquelle on regarde
    const memeLibelleAilleurs = [...parLibelle.values()]
      .some((o) => o.libelle === d.libelle && o.unite !== d.unite);
    const nom = memeLibelleAilleurs && d.unite === "pct" ? `${d.libelle} (growth %)` : d.libelle;
    kpis.push({ cle: `kpi:${ticker}:${cle}`, nom, ticker, unite: d.unite, points: d.points });
  }
  kpis.sort((a, b) => b.points.length - a.points.length || a.nom.localeCompare(b.nom));

  const dates = depots.map((d) => d.date).sort();
  const resultat = {
    kpis, depots: depots.length, rejetes,
    periode: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : null,
  };
  cache[ticker] = { quand: Date.now(), resultat };
  ecrireEtat(CLE_CACHE, cache);
  return resultat;
}

/** Ce qui a deja ete decouvert, sans refaire d'appel reseau. */
export function dejaDecouvert(ticker) {
  const c = lireEtat(CLE_CACHE, {})[ticker];
  return c ? c.resultat : null;
}

/** Serie {periode: valeur} d'un KPI decouvert, au format attendu par les graphes. */
export function serieKpi(cleComplete) {
  const [, ticker] = cleComplete.split(":");
  const d = dejaDecouvert(ticker);
  if (!d) return { serie: {}, kpi: null };
  const kpi = d.kpis.find((k) => k.cle === cleComplete);
  if (!kpi) return { serie: {}, kpi: null };
  const serie = {};
  for (const p of kpi.points) serie[p.periode] = p.valeur;
  return { serie, kpi };
}
