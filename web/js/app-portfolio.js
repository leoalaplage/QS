// =====================================================================
//  Page "Portfolio" : positions collees -> fiche A4 en PNG
// =====================================================================

import {
  resoudreTickers, chargerFacts, construireSerie, MODES, ErreurWorker,
} from "./qs-chart-edgar.js";
import { coursHistorique } from "./qs-prix.js";
import { SECTEURS_DEFAUT } from "./qs-config.js";
import { dessinerPortfolio } from "./qs-portfolio.js";
import { ECHELLE_PNG, workerUrl } from "./qs-settings.js";
import { lireEtat, ecrireEtat } from "./qs-etat.js";
import { $, el, vider, message, statut, respirer, blocResultat } from "./qs-ui.js";

const messages = $("#messages");
const sorties = $("#sorties");
const act = statut($("#statut"), $("#statut-texte"));
const saisie = $("#saisie");

// ---------------------------------------------------------------------
// Lecture des positions
// ---------------------------------------------------------------------
const NOMBRE = /^-?[\d\s,.]+%?$/;

/** "1 234,56" ou "1,234.56" -> 1234.56 */
function nombre(brut) {
  if (brut == null) return null;
  let t = String(brut).trim().replace(/[%$€\s]/g, "");
  if (!t) return null;
  //  Virgule decimale a l'europeenne : « 1.234,56 ». On ne se fie pas au
  //  dernier separateur seul, mais a sa position -- deux chiffres apres,
  //  c'est une decimale ; trois, c'est un separateur de milliers.
  const virgule = t.lastIndexOf(","), point = t.lastIndexOf(".");
  if (virgule > point) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const v = parseFloat(t);
  return isFinite(v) ? v : null;
}

/**
 * Lit un collage de positions.
 *
 * Le format n'est pas impose : on repere le ticker sur chaque ligne, puis
 * on interprete les nombres qui suivent. Un seul nombre est une quantite
 * -- ou un poids s'il porte un « % » ou si la colonne totalise 100. Deux
 * nombres sont une quantite et un prix de revient.
 *
 * @returns {{positions, ignorees}}
 */
export function lirePositions(texte) {
  const positions = [], ignorees = [];
  const lignes = String(texte).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let pourcent = false;

  for (const ligne of lignes) {
    const champs = ligne.split(/[\t;,]|\s{2,}/).map((c) => c.trim()).filter((c) => c !== "");
    if (!champs.length) continue;
    //  Le ticker est le premier champ non numerique fait de lettres et de
    //  points. Une ligne d'en-tete n'en produit aucun de valide et tombe
    //  dans les ignorees sans bruit.
    const brutTicker = champs.find((c) => /^[A-Za-z][A-Za-z.\-]{0,6}$/.test(c));
    if (!brutTicker) { ignorees.push(ligne); continue; }
    const ticker = brutTicker.toUpperCase();
    if (/^(TICKER|SYMBOL|NAME|TOTAL)$/.test(ticker)) { ignorees.push(ligne); continue; }

    const nombres = champs
      .filter((c) => c !== brutTicker && NOMBRE.test(c))
      .map((c) => ({ v: nombre(c), pct: c.includes("%") }))
      .filter((x) => x.v != null);

    if (!nombres.length) { positions.push({ ticker, quantite: null, cout: null }); continue; }
    if (nombres[0].pct) pourcent = true;
    positions.push({
      ticker,
      quantite: nombres[0].v,
      poidsDonne: nombres[0].pct,
      cout: nombres.length > 1 ? nombres[1].v : null,
    });
  }

  //  Une colonne unique qui totalise a peu pres 100 est une ponderation,
  //  meme sans signe pourcent.
  if (!pourcent && positions.length > 1 && positions.every((p) => p.cout == null)) {
    const somme = positions.reduce((a, p) => a + (p.quantite || 0), 0);
    if (somme > 95 && somme < 105) for (const p of positions) p.poidsDonne = true;
  }
  return { positions, ignorees };
}

// ---------------------------------------------------------------------
// Enrichissement
// ---------------------------------------------------------------------
const cacheSubmissions = new Map();

/** Pays et secteur declares a la SEC, pour les tickers hors table interne. */
async function ficheSociete(cik) {
  const cle = String(cik);
  if (cacheSubmissions.has(cle)) return cacheSubmissions.get(cle);
  const p = (async () => {
    try {
      const r = await fetch(`${workerUrl()}/submissions/${cik}`);
      if (!r.ok) return {};
      const d = await r.json();
      const a = d.addresses?.business || {};
      return { pays: paysLisible(a), industrie: d.sicDescription || null };
    } catch { return {}; }
  })();
  cacheSubmissions.set(cle, p);
  return p;
}

//  Le pays vient des champs que la SEC fournit deja en clair, jamais d'une
//  table devinee : `isForeignLocation` tranche entre etranger et americain,
//  et `stateOrCountryDescription` donne le libelle. Une table maison
//  affichait « P7 » et « G7 » a la place des Pays-Bas et du Danemark.
function paysLisible(adresse = {}) {
  if (adresse.isForeignLocation === false) return "United States";
  const desc = adresse.stateOrCountryDescription;
  //  Pour un deposant americain la description se reduit au code de l'Etat.
  if (desc && !/^[A-Z]{2}$/.test(desc)) return desc;
  if (desc && /^[A-Z]{2}$/.test(desc)) return "United States";
  return adresse.country || null;
}

const derniere = (serie) => {
  const k = Object.keys(serie || {}).sort();
  return k.length ? serie[k[k.length - 1]] : null;
};

/** CAGR sur les 5 derniers exercices d'une serie annuelle. */
function croissance5(serie) {
  const k = Object.keys(serie || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (k.length < 6) return null;
  const fin = serie[k[k.length - 1]], debut = serie[k[k.length - 6]];
  if (!(debut > 0) || !(fin > 0)) return null;
  return ((fin / debut) ** (1 / 5) - 1) * 100;
}

async function enrichir(p, cible) {
  const rap = () => ({ tags: [], devises: new Set(), formes: new Set(),
    derives: [], incoherences: [], anomaliesAnnuelles: [], points: 0 });
  const facts = await chargerFacts(p.cik);
  const cache = {}, r = rap();
  const lire = (c) => construireSerie(facts, c, MODES.ANNUEL, cache, r);

  const revenu = lire("revenue");
  const deviseComptes = [...r.devises][0] || "USD";

  const l = {
    ticker: p.ticker, nom: p.nom, cik: p.cik,
    secteur: SECTEURS_DEFAUT[p.ticker] || null,
    marge_brute: derniere(lire("gross_margin")),
    marge_op: derniere(lire("operating_margin")),
    marge_fcf: derniere(lire("fcf_margin")),
    roic: derniere(lire("roic")),
    croissance: croissance5(revenu),
    deviseComptes,
  };

  //  Cours : sans lui, ni valorisation ni capitalisation. Son absence ne
  //  doit pas faire disparaitre la ligne pour autant.
  try {
    const h = await coursHistorique(p.ticker, { plage: "1y", pas: "1mo" });
    const pts = (h.points || []).filter((x) => x.cloture != null && isFinite(x.cloture));
    const dernier = pts[pts.length - 1];
    l.prix = dernier ? dernier.cloture : null;
    l.deviseCours = h.devise || "USD";
    l.dateCours = dernier ? String(dernier.t).slice(0, 10) : null;
  } catch { l.prix = null; }

  const actions = derniere(lire("actions_circulation")) ?? derniere(lire("shares_diluted"));
  const memeDevise = !l.deviseCours || l.deviseCours === deviseComptes;
  if (l.prix != null && actions && memeDevise) {
    l.capitalisation = l.prix * actions;
    const bnpa = derniere(lire("eps_diluted"));
    if (bnpa > 0) l.per = l.prix / bnpa;
    const fcf = derniere(lire("fcf"));
    if (fcf != null && l.capitalisation > 0) l.fcf_yield = (fcf / l.capitalisation) * 100;
  } else if (!memeDevise) {
    l.avertissement = `quoted in ${l.deviseCours}, reports in ${deviseComptes}`;
  }

  //  Endettement net rapporte au flux de tresorerie libre : combien
  //  d'annees de FCF il faudrait pour eteindre la dette. L'EBITDA n'est
  //  pas une grandeur XBRL -- il se reconstitue, et mal -- alors que le
  //  FCF, lui, est deja calcule ici et ne se discute pas.
  const dette = (derniere(lire("lt_debt")) || 0) + (derniere(lire("short_debt")) || 0);
  const liquide = derniere(lire("cash")) || 0;
  const fcfAn = derniere(lire("fcf"));
  if (fcfAn > 0) l.dette_fcf = (dette - liquide) / fcfAn;

  if (!l.secteur || !l.pays) {
    const f = await ficheSociete(p.cik);
    l.secteur = l.secteur || (f.industrie ? f.industrie.slice(0, 26) : null);
    l.pays = f.pays || null;
  }
  l.cible = cible;
  return l;
}

// ---------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------
async function construire() {
  vider(messages);
  vider(sorties);

  const { positions, ignorees } = lirePositions(saisie.value);
  if (!positions.length) {
    message(messages, "erreur",
      "No position found. One line per holding: a ticker, then shares (and optionally an "
      + "average cost), or a weight in %.");
    return;
  }
  if (positions.length > 60) {
    message(messages, "erreur", `${positions.length} lines — 60 at most, each one is a round trip to EDGAR.`);
    return;
  }

  const { trouves, inconnus } = await resoudreTickers(positions.map((p) => p.ticker).join(","));
  const parTicker = new Map(trouves.map((s) => [s.ticker, s]));

  const lignes = [];
  const echecs = [...inconnus.map((t) => `${t} (not in SEC filings)`)];
  let fait = 0;

  for (const p of positions) {
    const s = parTicker.get(p.ticker);
    if (!s) continue;
    fait++;
    act.montrer(`${p.ticker} — ${fait}/${positions.length}`);
    await respirer();
    try {
      const l = await enrichir({ ...p, cik: s.cik, nom: s.nom }, p);
      l.quantite = p.quantite;
      l.poidsDonne = p.poidsDonne;
      l.coutUnitaire = p.cout;
      lignes.push(l);
    } catch (e) {
      echecs.push(`${p.ticker} (${e.message})`);
    }
  }
  act.cacher();

  if (!lignes.length) {
    message(messages, "erreur", `Nothing could be priced. ${echecs.join(", ")}`);
    return;
  }

  //  Valeur de chaque ligne. Trois cas : un poids donne directement, une
  //  quantite avec un cours, ou une quantite sans cours -- auquel cas la
  //  ligne existe mais ne pese rien, et on le dit.
  const parPoids = lignes.some((l) => l.poidsDonne);
  let total = 0, cout = 0;
  for (const l of lignes) {
    if (parPoids) {
      l.valeur = l.quantite || 0;
    } else if (l.quantite != null && l.prix != null) {
      l.valeur = l.quantite * l.prix;
      if (l.coutUnitaire != null) {
        l.cout = l.quantite * l.coutUnitaire;
        l.perf = l.coutUnitaire > 0 ? (l.prix / l.coutUnitaire - 1) * 100 : null;
      }
    } else {
      l.valeur = 0;
      l.sansValeur = true;
    }
    total += l.valeur;
    cout += l.cout || 0;
  }
  if (total <= 0) {
    message(messages, "erreur",
      "No position could be valued: shares were given but no price could be fetched. "
      + "Give weights in % instead, or check the EDGAR relay.");
    return;
  }
  for (const l of lignes) l.poids = l.valeur / total;
  lignes.sort((a, b) => b.poids - a.poids);

  const devise = lignes.find((l) => l.deviseCours)?.deviseCours || "USD";
  const dates = lignes.map((l) => l.dateCours).filter(Boolean).sort();

  const canvas = dessinerPortfolio(lignes, {
    devise: parPoids ? "" : devise,
    total: parPoids ? 100 : total,
    cout: parPoids ? 0 : cout,
    titre: $("#titre").value.trim() || "Portfolio",
    dateCours: dates.length ? dates[dates.length - 1] : null,
  }, { echelle: ECHELLE_PNG });

  sorties.appendChild(blocResultat(canvas, {
    titre: "Portfolio report (A4)",
    nomFichier: `qs-portfolio-${new Date().toISOString().slice(0, 10)}.png`,
  }));

  const alertes = lignes.filter((l) => l.avertissement).map((l) => `${l.ticker}: ${l.avertissement}`);
  const sansPrix = lignes.filter((l) => l.sansValeur).map((l) => l.ticker);
  const notes = [];
  if (echecs.length) notes.push(`Left out: ${echecs.join(", ")}.`);
  if (sansPrix.length) notes.push(`No price, counted as zero: ${sansPrix.join(", ")}.`);
  if (alertes.length) notes.push(`Currency mismatch, valuation ratios skipped — ${alertes.join("; ")}.`);
  if (ignorees.length) notes.push(`${ignorees.length} line(s) ignored (header or unreadable).`);
  message(messages, notes.length ? "info" : "ok",
    notes.length ? notes.join(" ") : `${lignes.length} positions priced and charted.`);

  ecrireEtat("portfolio", { saisie: saisie.value, titre: $("#titre").value });
}

// ---------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------
$("#btn-generer").addEventListener("click", () => {
  construire().catch((e) => {
    act.cacher();
    message(messages, "erreur", e instanceof ErreurWorker ? e.message : `Unexpected error: ${e.message}`);
  });
});

$("#btn-reset").addEventListener("click", () => {
  saisie.value = "";
  vider(sorties);
  vider(messages);
  majApercu();
});

$("#btn-exemple").addEventListener("click", async () => {
  const w = await (await fetch(new URL("../data/watchlist.json", import.meta.url))).json();
  const poids = (100 / w.tickers.length).toFixed(2);
  saisie.value = w.tickers.map((t) => `${t}, ${poids}%`).join("\n");
  majApercu();
});

function majApercu() {
  const { positions, ignorees } = lirePositions(saisie.value);
  const zone = $("#apercu-saisie");
  if (!positions.length) { zone.textContent = ""; return; }
  const avecCout = positions.filter((p) => p.cout != null).length;
  const parPoids = positions.some((p) => p.poidsDonne);
  zone.textContent = `${positions.length} positions read — ${parPoids ? "weights in %" : "share counts"}`
    + (avecCout ? `, ${avecCout} with a cost basis (performance will be shown)` : ", no cost basis (no performance)")
    + (ignorees.length ? `, ${ignorees.length} line(s) ignored` : "");
}

saisie.addEventListener("input", majApercu);

{
  const sauve = lireEtat("portfolio", {});
  if (sauve.saisie) saisie.value = sauve.saisie;
  if (sauve.titre) $("#titre").value = sauve.titre;
  majApercu();
}
