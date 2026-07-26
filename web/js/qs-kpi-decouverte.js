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

// Motifs generiques. Groupe 1 = libelle, groupe 2 = nombre, groupe 3 = ordre.
const MOTIFS = [
  [/([A-Z][A-Za-z][A-Za-z &/'\-]{2,44}?) of \$([\d,.]+)\s*(billion|million|trillion)\b/g, "money"],
  [/([A-Z][A-Za-z][A-Za-z &/'\-]{2,44}?) of ([\d.]+)\s*%/g, "pct"],
  [/([A-Z][A-Za-z][A-Za-z &/'\-]{2,44}?) (?:grew|increased|rose|was up)(?: by)? ([\d.]+)\s*%/g, "pct"],
  [/([A-Z][A-Za-z][A-Za-z &/'\-]{2,44}?) (?:was|were) \$([\d,.]+)\s*(billion|million|trillion)\b/g, "money"],
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
      const libelle = m[1].replace(/\s+/g, " ").replace(/^[\s,;:*-]+|[\s,;:*-]+$/g, "");
      if (!estLibelle(libelle) || trouves.has(libelle)) continue;
      let v = parseFloat(m[2].replace(/,/g, ""));
      if (!isFinite(v)) continue;
      if (m[3]) v *= MULT[m[3].toLowerCase()] || 1;
      const d = Math.max(0, m.index - 55);
      trouves.set(libelle, { unite, valeur: v, extrait: texte.slice(d, m.index + m[0].length + 30).trim() });
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

async function depotsResultats(cik, nb) {
  const d = await relais(`/submissions/${cik}`);
  const r = d.filings?.recent || {};
  const out = [];
  for (let i = 0; i < (r.form || []).length && out.length < nb; i++) {
    if (r.form[i] !== "8-K" || !String(r.items[i] || "").includes("2.02")) continue;
    out.push({
      accession: r.accessionNumber[i].replace(/-/g, ""),
      date: r.filingDate[i],
      principal: r.primaryDocument[i],
    });
  }
  return out;
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
export async function decouvrir(ticker, cik, { trimestres = 8, minOccurrences = 3,
  surAvancement = () => {}, forcer = false } = {}) {
  const cache = lireEtat(CLE_CACHE, {});
  const enCache = cache[ticker];
  if (!forcer && enCache && Date.now() - enCache.quand < PEREMPTION) return enCache.resultat;

  const depots = await depotsResultats(cik, trimestres);
  const parLibelle = new Map();

  for (const depot of depots) {
    surAvancement(`${ticker}: reading the earnings release of ${depot.date}…`);
    let texte;
    try {
      const chemin = await communique(cik, depot);
      if (!chemin) continue;
      texte = enTextePlat(await relais(chemin, false));
    } catch { continue; }

    for (const [libelle, info] of scanner(texte)) {
      if (!parLibelle.has(libelle)) parLibelle.set(libelle, { unite: info.unite, points: [] });
      parLibelle.get(libelle).points.push({
        periode: periodeDe(depot.date), valeur: info.valeur,
        extrait: info.extrait, date: depot.date, accession: depot.accession,
      });
    }
  }

  const kpis = [], rejetes = [];
  for (const [libelle, d] of parLibelle) {
    if (d.points.length < Math.min(minOccurrences, depots.length)) { rejetes.push(libelle); continue; }
    d.points.sort((a, b) => a.periode.localeCompare(b.periode));
    kpis.push({
      cle: `kpi:${ticker}:${libelle}`, nom: libelle, ticker,
      unite: d.unite, points: d.points,
    });
  }
  kpis.sort((a, b) => b.points.length - a.points.length || a.nom.localeCompare(b.nom));

  const resultat = { kpis, depots: depots.length, rejetes };
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
