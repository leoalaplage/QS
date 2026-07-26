// =====================================================================
//  QS - KPI operationnels, extraits des communiques de resultats
//
//  POURQUOI CE MODULE EXISTE
//  Les indicateurs que les societes mettent en avant (GBV, room nights,
//  Run Rate, cRPO, volumes de paiement...) ne sont PAS balises en XBRL :
//  l'obligation de balisage couvre les etats financiers, les notes et la
//  page de garde, pas le MD&A ni les communiques. Verifie sur le 10-K
//  d'Airbnb : « Gross Booking Value » est dans le texte, absent du XBRL,
//  y compris des tags d'extension de la societe.
//
//  Ils restent publics : ils figurent dans la piece EX-99.1 du 8-K de
//  resultats, chaque trimestre, dans une formulation tres stable par
//  societe. On les lit donc dans le texte, avec une regle par societe.
//
//  CE QUE CA IMPLIQUE, ET QU'IL FAUT ASSUMER
//  Une regle est un motif ecrit a la main sur la formulation d'une
//  societe. Quand elle change la redaction de son communique, le motif
//  ne trouve plus rien -- il ne renvoie JAMAIS un chiffre faux, il
//  renvoie zero resultat, et l'interface le signale. C'est le compromis
//  choisi : rater une valeur est acceptable, en inventer une ne l'est pas.
//
//  Chaque valeur extraite conserve sa provenance : date de depot, numero
//  d'accession, et l'extrait de phrase exact d'ou vient le nombre.
// =====================================================================

import { workerUrl } from "./qs-settings.js";

const MULTIPLES = { billion: 1e9, million: 1e6, thousand: 1e3, b: 1e9, m: 1e6 };

/**
 * Regles d'extraction, par ticker.
 *   cle     : identifiant interne
 *   nom     : libelle affiche
 *   unite   : "money" | "pct" | "number"
 *   motif   : expression reguliere ; groupe 1 = le nombre,
 *             groupe "mult" (optionnel) = billion / million
 *   note    : precision affichee a l'utilisateur
 *
 * Les motifs ci-dessous ont ete ecrits sur les communiques reels de 2026
 * et verifies un par un.
 */
export const REGLES = {
  MSCI: [
    { cle: "retention_rate", nom: "Retention Rate", unite: "pct",
      motif: /Retention Rate of ([\d.]+)\s*%/i },
    { cle: "run_rate_growth", nom: "Organic subscription Run Rate growth", unite: "pct",
      motif: /Run Rate growth of ([\d.]+)\s*%/i },
  ],
  NOW: [
    { cle: "crpo", nom: "Current RPO (cRPO)", unite: "money",
      motif: /current remaining performance obligations[^$]{0,160}?\$([\d.]+)\s*(?<mult>billion|million)/i },
    { cle: "crpo_growth", nom: "cRPO growth", unite: "pct",
      motif: /[Cc]urrent remaining performance obligations of \$[\d.]+ billion[^%]{0,60}?representing ([\d.]+)\s*% year-over-year/i },
  ],
  BKNG: [
    { cle: "room_nights_growth", nom: "Room nights growth", unite: "pct",
      motif: /Room nights grew ([\d.]+)\s*%/i,
      note: "Booking publishes the growth rate, not the absolute level, in its release." },
    { cle: "gross_bookings_growth", nom: "Gross bookings growth", unite: "pct",
      motif: /Gross bookings grew ([\d.]+)\s*%/i,
      note: "Growth rate as published; the absolute figure is not in the highlights." },
  ],
  V: [
    { cle: "payments_volume_growth", nom: "Payments volume growth", unite: "pct",
      motif: /Payments volume\s+([\d.]+)\s*%/i,
      note: "First column of the operational table: growth versus the same quarter last year." },
    { cle: "cross_border_growth", nom: "Cross-border volume growth", unite: "pct",
      motif: /Cross-border volume total\s+([\d.]+)\s*%/i },
  ],
};

export const TICKERS_COUVERTS = Object.keys(REGLES);

// ---------------------------------------------------------------------
// Reseau
// ---------------------------------------------------------------------
async function viaRelais(chemin, json = true) {
  const base = workerUrl();
  if (!base) throw new Error("No EDGAR relay configured.");
  const r = await fetch(`${base}${chemin}`);
  if (!r.ok) throw new Error(`Relay answered ${r.status} for ${chemin}`);
  return json ? r.json() : r.text();
}

/** Les N derniers 8-K de resultats (item 2.02) d'une societe. */
async function depotsResultats(cik, nb) {
  const d = await viaRelais(`/submissions/${cik}`);
  const r = d.filings?.recent || {};
  const out = [];
  for (let i = 0; i < (r.form || []).length && out.length < nb; i++) {
    if (r.form[i] !== "8-K") continue;
    if (!String(r.items[i] || "").includes("2.02")) continue;
    out.push({
      accession: r.accessionNumber[i].replace(/-/g, ""),
      date: r.filingDate[i],
      principal: r.primaryDocument[i],
    });
  }
  return out;
}

/**
 * URL du communique dans un depot.
 * Le nom du fichier est libre : « exhibit991earningsrelease-.htm » chez MSCI,
 * « erq2fy26.htm » chez ServiceNow. On retient donc le plus gros .htm qui
 * n'est ni le document principal du 8-K ni un fichier de rendu R*.htm.
 */
async function urlCommunique(cik, depot) {
  const idx = await viaRelais(`/archive/${cik}/${depot.accession}/index.json`);
  const items = (idx.directory?.item || []).filter((it) => it.name.endsWith(".htm")
    && it.name !== depot.principal
    && !/^R\d+\.htm$/.test(it.name));
  if (!items.length) return null;
  items.sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
  return { nom: items[0].name, chemin: `/archive/${cik}/${depot.accession}/${items[0].name}` };
}

/** HTML -> texte plat, entites courantes resolues. */
export function enTextePlat(html) {
  let t = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  const entites = {
    "&#8220;": '"', "&#8221;": '"', "&#8217;": "'", "&#8216;": "'",
    "&amp;": "&", "&nbsp;": " ", "&#160;": " ", "&#8212;": "-", "&#8211;": "-",
    "&#8226;": "*", "&#9679;": "*", "&#59;": ";", "&quot;": '"', "&#39;": "'",
  };
  for (const [k, v] of Object.entries(entites)) t = t.split(k).join(v);
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return t.replace(/\s+/g, " ").trim();
}

/** Applique les regles d'un ticker a un texte de communique. */
export function extraire(ticker, texte) {
  const regles = REGLES[ticker] || [];
  const out = [];
  for (const regle of regles) {
    const m = regle.motif.exec(texte);
    if (!m) { out.push({ ...regle, valeur: null, extrait: null }); continue; }
    let v = parseFloat(m[1]);
    const mult = m.groups?.mult;
    if (mult) v *= MULTIPLES[mult.toLowerCase()] || 1;
    // l'extrait sert de preuve : on montre la phrase d'ou sort le nombre
    const debut = Math.max(0, m.index - 60);
    out.push({
      ...regle, valeur: v,
      extrait: texte.slice(debut, m.index + m[0].length + 40).trim(),
    });
  }
  return out;
}

/**
 * Series de KPI operationnels d'une societe, sur les `nb` derniers trimestres.
 * @returns {{series: Object, depots: Array, couvert: boolean}}
 *   series : {cleKpi: {nom, unite, note, points:[{date, valeur, extrait, accession}]}}
 */
export async function kpiOperationnels(ticker, cik, nb = 8, surAvancement = () => {}) {
  if (!REGLES[ticker]) return { series: {}, depots: [], couvert: false };

  const depots = await depotsResultats(cik, nb);
  const series = {};
  for (const regle of REGLES[ticker]) {
    series[regle.cle] = { nom: regle.nom, unite: regle.unite, note: regle.note || null, points: [] };
  }

  for (const depot of depots) {
    surAvancement(`Reading ${ticker} earnings release of ${depot.date}...`);
    let texte;
    try {
      const doc = await urlCommunique(cik, depot);
      if (!doc) continue;
      texte = enTextePlat(await viaRelais(doc.chemin, false));
    } catch {
      continue;   // un depot illisible ne doit pas faire tomber les autres
    }
    for (const r of extraire(ticker, texte)) {
      if (r.valeur === null) continue;
      series[r.cle].points.push({
        date: depot.date, valeur: r.valeur, extrait: r.extrait, accession: depot.accession,
      });
    }
  }

  for (const s of Object.values(series)) s.points.sort((a, b) => a.date.localeCompare(b.date));
  return { series, depots, couvert: true };
}
