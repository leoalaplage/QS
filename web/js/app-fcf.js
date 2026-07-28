// =====================================================================
//  Page "FCF" : regularite du flux de tresorerie libre
//
//  Deux lectures de la meme analyse :
//    - un tableau de COMPARAISON, une ligne par societe, sur une fenetre
//      choisie -- fait pour classer des dizaines de titres d'un coup ;
//    - le detail fenetre par fenetre d'une societe, pour voir si sa
//      regularite tient sur trois ans comme sur quinze.
// =====================================================================

import { SUGGESTIONS } from "./qs-chart-metrics.js";
import {
  chercherSocietes, chargerTickers, resoudreTickers, chargerFacts,
  construireSerie, MODES, ErreurWorker,
} from "./qs-chart-edgar.js";
import { serieValo } from "./qs-prix.js";
import { analyser, fenetre, noter, FENETRES, PAR_AN } from "./qs-fcf.js";
import { lireEtat, ecrireEtat } from "./qs-etat.js";
import { $, el, vider, message, statut, respirer, telechargerTexte } from "./qs-ui.js";

const messages = $("#messages");
const sorties = $("#sorties");
const act = statut($("#statut"), $("#statut-texte"));

const MAX_SOCIETES = 40;

//  Filet de securite : sans lui, une erreur imprevue ne laisse aucune
//  trace a l'ecran -- les boutons semblent morts et rien n'explique
//  pourquoi. Elle s'affiche desormais la ou l'utilisateur regarde, avec
//  le fichier et la ligne, de quoi la rapporter telle quelle.
function signaler(prefixe, detail) {
  try {
    vider(messages);
    message(messages, "erreur", `${prefixe}: ${detail}`);
  } catch { /* si meme l'affichage echoue, il ne reste que la console */ }
}
window.addEventListener("error", (e) => {
  signaler("Script error", `${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})`);
});
window.addEventListener("unhandledrejection", (e) => {
  signaler("Unhandled error", (e.reason && e.reason.message) || String(e.reason));
});

const reglages = lireEtat("fcf", { periode: "annuel", fenetre: 10 });
let societes = [];
let dernier = null;          // { lignes, periode, fenetre } pour le tri et le CSV
let triCourant = { colonne: "cagr", desc: true };

// ---------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------
function dessinerSelection() {
  const zone = $("#selection");
  vider(zone);
  $("#selection-vide").classList.toggle("cache", societes.length > 0);
  societes.forEach((s, i) => {
    const j = el("span", { classe: "jeton" });
    j.appendChild(el("b", { texte: s.ticker }));
    const croix = el("button", { texte: "×", type: "button", title: `Remove ${s.ticker}` });
    croix.addEventListener("click", () => { societes.splice(i, 1); dessinerSelection(); });
    j.appendChild(croix);
    zone.appendChild(j);
  });
  if (societes.length > 1) {
    const vider1 = el("button", { classe: "lien", type: "button", texte: `clear all (${societes.length})` });
    vider1.addEventListener("click", () => { societes = []; dessinerSelection(); });
    zone.appendChild(vider1);
  }
}

function ajouterSociete(s, silencieux = false) {
  if (societes.some((x) => x.ticker === s.ticker)) return false;
  if (societes.length >= MAX_SOCIETES) {
    if (!silencieux) {
      message(messages, "info", `${MAX_SOCIETES} companies at a time — each one is a separate round trip to EDGAR.`);
    }
    return false;
  }
  societes.push(s);
  return true;
}

// ---------------------------------------------------------------------
// Ajout en lot : coller une liste de tickers
// ---------------------------------------------------------------------
async function ajouterLot() {
  const saisie = $("#lot").value.trim();
  vider(messages);
  if (!saisie) {
    message(messages, "info", "Type or paste tickers in the field first — for example: AAPL, MSFT, V.");
    return;
  }
  const { trouves, inconnus } = await resoudreTickers(saisie.replace(/\s+/g, ","));
  let ajoutes = 0;
  for (const s of trouves) if (ajouterSociete(s, true)) ajoutes++;
  dessinerSelection();
  $("#lot").value = "";
  vider(messages);
  if (inconnus.length) {
    message(messages, "info",
      `${ajoutes} added. Not found in SEC filings: ${inconnus.join(", ")} — `
      + "a company not listed in the United States files nothing here.");
  } else if (ajoutes) {
    message(messages, "ok", `${ajoutes} compan${ajoutes === 1 ? "y" : "ies"} added.`);
  } else {
    //  Zero ajout n'est pas forcement une panne : ils peuvent deja tous
    //  etre la. Le dire, plutot que de laisser le bouton passer pour mort.
    message(messages, "info", "Nothing new — those companies are already selected.");
  }
}

$("#btn-lot").addEventListener("click", () => ajouterLot());

// ---------------------------------------------------------------------
// La watchlist du tableau QS, en un clic
//
//  La liste est extraite du tableau de bord et figee dans
//  web/data/watchlist.json, parce que le fichier source vit a la racine
//  du depot et n'est pas publie. Deux lignes n'y figurent pas et ne
//  peuvent pas y figurer : Hermes et Constellation Software ne sont pas
//  cotees aux Etats-Unis, donc ne deposent rien a la SEC. « NOVO B »,
//  la ligne de Copenhague, est ramenee a NVO, son certificat americain.
// ---------------------------------------------------------------------
let watchlist = null;

async function chargerWatchlist() {
  if (watchlist) return watchlist;
  const r = await fetch(new URL("../data/watchlist.json", import.meta.url));
  if (!r.ok) throw new Error("watchlist.json not found");
  watchlist = await r.json();
  return watchlist;
}

$("#btn-watchlist").addEventListener("click", async () => {
  const b = $("#btn-watchlist");
  b.disabled = true;
  try {
    const w = await chargerWatchlist();
    const { trouves } = await resoudreTickers(w.tickers.join(","));
    let ajoutes = 0;
    for (const s of trouves) if (ajouterSociete(s, true)) ajoutes++;
    dessinerSelection();
    vider(messages);
    const hors = (w.horsPortee || []).map((x) => `${x.ticker} — ${x.raison}`);
    message(messages, ajoutes ? "ok" : "info",
      ajoutes ? `${ajoutes} of your watchlist added.`
        : "Your watchlist is already fully selected."

      + (hors.length ? ` Out of reach, and always will be: ${hors.join(", ")} — no US listing means no SEC filings.` : ""));
  } catch (e) {
    message(messages, "erreur", `Could not load the watchlist: ${e.message}`);
  } finally {
    b.disabled = false;
  }
});
$("#lot").addEventListener("keydown", (e) => { if (e.key === "Enter") ajouterLot(); });

// ---------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------
(async () => {
  const table = await chargerTickers();
  const zone = $("#suggestions-rapides");
  SUGGESTIONS.forEach((tk, i) => {
    const e = table[tk];
    if (!e) return;
    if (i) zone.appendChild(document.createTextNode(" · "));
    const b = el("button", { classe: "lien", texte: tk, type: "button", title: e[1] });
    b.addEventListener("click", () => { ajouterSociete({ ticker: tk, cik: e[0], nom: e[1] }); dessinerSelection(); });
    zone.appendChild(b);
  });
})();

const champ = $("#recherche");
const liste = $("#resultats-recherche");
let minuteur = null;
const fermerListe = () => { liste.classList.add("cache"); vider(liste); };

async function rechercher() {
  const q = champ.value.trim();
  if (!q) { fermerListe(); return; }
  const trouves = await chercherSocietes(q, 12);
  vider(liste);
  if (!trouves.length) {
    liste.appendChild(el("div", { classe: "vide", texte: `No company matches "${q}" in SEC filings.` }));
  } else {
    for (const s of trouves) {
      const b = el("button", { type: "button" });
      b.appendChild(el("span", { classe: "tk", texte: s.ticker }));
      b.appendChild(el("span", { classe: "nm", texte: s.nom }));
      b.addEventListener("click", () => {
        ajouterSociete(s); dessinerSelection(); champ.value = ""; fermerListe(); champ.focus();
      });
      liste.appendChild(b);
    }
  }
  liste.classList.remove("cache");
}

champ.addEventListener("input", () => { clearTimeout(minuteur); minuteur = setTimeout(rechercher, 120); });
champ.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fermerListe();
  if (e.key === "Enter") { const p = liste.querySelector("button"); if (p) { e.preventDefault(); p.click(); } }
});
document.addEventListener("click", (e) => { if (!e.target.closest(".champ-recherche")) fermerListe(); });

// ---------------------------------------------------------------------
// Reglages
// ---------------------------------------------------------------------
const selPeriode = $("#periode");
selPeriode.value = reglages.periode || "annuel";

const zonePresets = $("#presets-fenetre");
let fenetreChoisie = FENETRES.includes(reglages.fenetre) ? reglages.fenetre : 10;

const RACCOURCIS = [3, 5, 7, 10, 15];

function dessinerPresets() {
  vider(zonePresets);
  for (const n of RACCOURCIS) {
    const b = el("button", {
      type: "button", texte: `${n}y`,
      classe: `preset${n === fenetreChoisie ? " actif" : ""}`,
    });
    b.addEventListener("click", () => { fenetreChoisie = n; dessinerPresets(); majNote(); reafficher(); });
    zonePresets.appendChild(b);
  }
  //  La liste ne reprend PAS les raccourcis : deux commandes affichant la
  //  meme valeur -- un bouton « 10y » actif a cote d'une liste sur
  //  « 10 years » -- laissent croire qu'elles font deux choses differentes.
  //  Elle ne sert qu'aux durees que les raccourcis ne couvrent pas.
  const autre = el("select", { classe: "preset-select", title: "Any other window, 3 to 15 years" });
  autre.appendChild(el("option", { value: "", texte: RACCOURCIS.includes(fenetreChoisie) ? "other…" : `${fenetreChoisie} years` }));
  for (const n of FENETRES) {
    if (RACCOURCIS.includes(n)) continue;
    autre.appendChild(el("option", { value: String(n), texte: `${n} years` }));
  }
  autre.value = "";
  autre.addEventListener("change", () => {
    if (!autre.value) return;
    fenetreChoisie = Number(autre.value); dessinerPresets(); majNote(); reafficher();
  });
  zonePresets.appendChild(autre);
}

function majNote() {
  const mode = selPeriode.value;
  const parAn = PAR_AN[mode];
  const n = Math.round(fenetreChoisie * parAn);
  const note = $("#note-periode");
  if (mode === "trimestre") {
    note.textContent = `${n} quarterly points over ${fenetreChoisie} years. Cash collection is `
      + "seasonal: expect a saw-tooth and a low R², which measures the calendar rather than the "
      + "business. TTM is the honest choice for a short window.";
    note.className = "aide souci";
  } else if (mode === "ttm") {
    note.textContent = `${n} rolling twelve-month points over ${fenetreChoisie} years — seasonality `
      + "removed, four times more points than annual to fit the trend on.";
    note.className = "aide";
  } else {
    note.textContent = `${n} fiscal years. Growth rates are annual in every mode.`;
    note.className = "aide";
  }
}

selPeriode.addEventListener("change", () => { majNote(); reafficher(); });
dessinerPresets();
majNote();

function enregistrerReglages() {
  ecrireEtat("fcf", { periode: selPeriode.value, fenetre: fenetreChoisie });
}

// ---------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------
const pourcent = (x, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)} %`);
const deuxDec = (x) => (x == null ? "—" : x.toFixed(2));

function montant(v, devise = "USD") {
  if (v == null || !isFinite(v)) return "—";
  const signe = v < 0 ? "−" : "";
  const a = Math.abs(v);
  const [n, u] = a >= 1e12 ? [a / 1e12, "T"] : a >= 1e9 ? [a / 1e9, "B"]
    : a >= 1e6 ? [a / 1e6, "M"] : [a, ""];
  const sym = devise === "USD" ? "$" : devise === "EUR" ? "€" : `${devise} `;
  return `${signe}${sym}${n.toFixed(n >= 100 || !u ? 0 : 1)}${u}`;
}

/**
 * Teinte de fond d'une cellule, du rouge au vert. `t` va de 0 (mauvais) a 1
 * (bon). Volontairement pale : la couleur guide l'oeil sans rendre le
 * chiffre penible a lire.
 */
function teinte(t) {
  if (t == null) return "";
  const c = Math.max(0, Math.min(1, t));
  return `background:hsl(${(8 + c * 130).toFixed(0)} 62% ${(96 - c * 6).toFixed(0)}%)`;
}

const echelleCagr = (x) => (x == null ? null : Math.max(0, Math.min(1, (x + 0.05) / 0.30)));
const echelleR2 = (x) => (x == null ? null : Math.max(0, Math.min(1, (x - 0.3) / 0.65)));
//  Pour le CV, PLUS BAS vaut mieux : l'echelle est inversee.
const echelleCv = (x) => (x == null ? null : 1 - Math.max(0, Math.min(1, (x - 0.1) / 0.6)));

// ---------------------------------------------------------------------
// Tableau de comparaison
// ---------------------------------------------------------------------
const COLONNES = [
  { cle: "ticker", titre: "Ticker", texte: true },
  { cle: "nom", titre: "Company", texte: true, discret: true },
  { cle: "fcf", titre: "Latest FCF" },
  { cle: "cagr", titre: "FCF CAGR" },
  { cle: "r2", titre: "R²" },
  { cle: "cv", titre: "Yield CV", bas: true },
  { cle: "rende", titre: "Avg yield" },
  { cle: "note", titre: "Score" },
];

function cellule(l, col) {
  switch (col.cle) {
    case "ticker": return { texte: l.ticker, gras: true };
    case "nom": return { texte: l.nom };
    case "fcf": return { texte: montant(l.fcf, l.devise) };
    case "cagr": return { texte: pourcent(l.cagr), fond: echelleCagr(l.cagr) };
    case "r2": return { texte: deuxDec(l.r2), fond: echelleR2(l.r2) };
    case "cv": return { texte: deuxDec(l.cv), fond: echelleCv(l.cv) };
    case "rende": return { texte: l.rende == null ? "—" : `${l.rende.toFixed(1)} %` };
    case "note": return { texte: l.note == null ? "—" : String(l.note), fond: l.note == null ? null : l.note / 100, gras: true };
    default: return { texte: "—" };
  }
}

function trier(lignes) {
  const { colonne, desc } = triCourant;
  const col = COLONNES.find((c) => c.cle === colonne) || COLONNES[3];
  return [...lignes].sort((a, b) => {
    const x = a[colonne], y = b[colonne];
    if (col.texte) return String(x).localeCompare(String(y)) * (desc ? -1 : 1);
    //  Une valeur absente descend toujours en bas, quel que soit le sens :
    //  elle n'est ni bonne ni mauvaise, elle est inconnue.
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x - y) * (desc ? -1 : 1);
  });
}

function dessinerComparaison() {
  if (!dernier) return;
  vider(sorties);

  const carte = el("section", { classe: "carte" });
  const entete = el("div", { classe: "entete-resultat" });
  entete.appendChild(el("h2", {
    texte: `${dernier.lignes.length} companies, all over the same ${dernier.fenetre}-year window`,
  }));
  entete.appendChild(el("span", { classe: "taille", texte: dernier.libelleMode }));
  carte.appendChild(entete);

  const table = el("table", { classe: "tbl-fcf tri" });
  const tr = el("tr");
  for (const col of COLONNES) {
    const th = el("th", {
      texte: col.titre + (triCourant.colonne === col.cle ? (triCourant.desc ? " ▾" : " ▴") : ""),
      title: col.bas ? "Lower is better" : "",
    });
    th.addEventListener("click", () => {
      if (triCourant.colonne === col.cle) triCourant.desc = !triCourant.desc;
      else triCourant = { colonne: col.cle, desc: !col.texte && !col.bas };
      dessinerComparaison();
    });
    tr.appendChild(th);
  }
  table.appendChild(tr);

  for (const l of trier(dernier.lignes)) {
    const ligne = el("tr");
    for (const col of COLONNES) {
      const c = cellule(l, col);
      const td = el("td", { classe: col.texte ? (col.discret ? "menu" : "fenetre") : "" , texte: c.texte });
      if (c.fond != null) td.setAttribute("style", teinte(c.fond));
      if (col.cle === "r2") {
        if (l.croissanceAjustee != null) {
          td.title = `Fitted growth ${pourcent(l.croissanceAjustee)} per year`;
        } else if (l.negatifs && l.negatifs.length) {
          //  Nommer l'exercice fautif : « Booking 2020 » se comprend d'un
          //  coup d'oeil, « negative free cash flow » se cherche.
          const q = l.negatifs.map((x) => `${x.cle} (${montant(x.val, l.devise)})`).join(", ");
          td.title = `No R²: free cash flow was negative in ${q}, and a negative number has no `
            + "logarithm. Shorten the window to exclude it.";
        }
      }
      if (col.cle === "cagr" && l.cagr == null && l.negatif) td.title = "Negative FCF at one end";
      ligne.appendChild(td);
    }
    if (l.refus || l.alerte) ligne.title = [l.refus, l.alerte].filter(Boolean).join(" · ");
    if (l.refus) ligne.classList.add("vide-ligne");
    table.appendChild(ligne);
  }

  const env = el("div", { classe: "table-scroll" });
  env.appendChild(table);
  carte.appendChild(env);
  carte.appendChild(el("p", { classe: "aide",
    texte: "Click a column to sort. Read CAGR and R² together: the first says how fast, "
      + "the second whether it was a habit or a lucky stretch. The Score blends the three "
      + "columns (growth 40%, regularity 40%, yield stability 20%); the 5-year and 10-year "
      + "scores are saved and appear as two extra columns on the Table dashboard." }));
  sorties.appendChild(carte);

  //  Le detail fenetre par fenetre : replie, parce qu'il n'interesse qu'une
  //  fois la comparaison faite et qu'une societe a retenu l'attention.
  const detail = el("details", { classe: "carte repli" });
  detail.appendChild(el("summary", { texte: "Window by window, company by company" }));
  for (const l of dernier.lignes) {
    if (!l.toutes) continue;
    detail.appendChild(tableauSociete(l));
  }
  sorties.appendChild(detail);
}

function tableauSociete(l) {
  const bloc = el("div", { classe: "detail-societe" });
  bloc.appendChild(el("h3", { texte: `${l.ticker} — ${l.nom}` }));

  const table = el("table", { classe: "tbl-fcf" });
  const tr = el("tr");
  for (const t of ["Window", "Range", "FCF CAGR", "R²", "Yield CV", "Avg yield"]) {
    tr.appendChild(el("th", { texte: t }));
  }
  table.appendChild(tr);

  for (const f of l.toutes) {
    const ligne = el("tr");
    ligne.appendChild(el("td", { classe: "fenetre", texte: `${f.annees}y` }));
    ligne.appendChild(el("td", { classe: "menu", texte: f.periode || "—" }));
    const c1 = el("td", { texte: pourcent(f.cagr) });
    c1.setAttribute("style", teinte(echelleCagr(f.cagr)));
    ligne.appendChild(c1);
    const c2 = el("td", { texte: deuxDec(f.r2) });
    c2.setAttribute("style", teinte(echelleR2(f.r2)));
    ligne.appendChild(c2);
    const c3 = el("td", { texte: deuxDec(f.cv) });
    c3.setAttribute("style", teinte(echelleCv(f.cv)));
    ligne.appendChild(c3);
    ligne.appendChild(el("td", { classe: "menu",
      texte: f.moyenneRendement == null ? "—" : `${f.moyenneRendement.toFixed(1)} %` }));
    if (!f.periode) ligne.classList.add("vide-ligne");
    table.appendChild(ligne);
  }
  const env = el("div", { classe: "table-scroll" });
  env.appendChild(table);
  bloc.appendChild(env);
  if (l.alerte) bloc.appendChild(el("p", { classe: "aide souci", texte: l.alerte }));
  return bloc;
}

/**
 * Recalcule l'affichage a partir des series deja telechargees.
 *
 * Quand rien n'a encore ete telecharge, le changement de fenetre n'avait
 * AUCUN effet visible : le bouton s'allumait, le reste de la page ne
 * bougeait pas, et la commande passait pour cassee. Elle le dit
 * desormais, plutot que de ne rien faire en silence.
 */
function reafficher() {
  enregistrerReglages();
  if (!dernier || !dernier.brut) {
    if (societes.length) {
      vider(messages);
      message(messages, "info",
        `Window set to ${fenetreChoisie} years — press Analyse to compute it for `
        + `${societes.length === 1 ? "this company" : `all ${societes.length} companies`}.`);
    }
    return;
  }
  calculer();
  dessinerComparaison();
}

// ---------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------
const MODE_DE = { annuel: MODES.ANNUEL, trimestre: MODES.TRIMESTRE, ttm: MODES.TTM };

/** Applique les reglages courants aux series brutes deja en memoire. */
function calculer() {
  const mode = selPeriode.value;
  const parAn = PAR_AN[mode];
  const lignes = [];
  for (const b of dernier.brut) {
    const series = b.parMode[mode];
    if (!series) continue;
    const f = fenetre(series.fcf, series.rende, fenetreChoisie, parAn);
    const toutes = analyser(series.fcf, series.rende, FENETRES, parAn);
    const n = noter(f);
    //  Les notes a 5 et 10 ans sont calculees quelle que soit la fenetre
    //  affichee : ce sont elles que le tableau de bord reprend.
    const n5 = noter(fenetre(series.fcf, series.rende, 5, parAn));
    const n10 = noter(fenetre(series.fcf, series.rende, 10, parAn));
    lignes.push({
      ticker: b.ticker, nom: b.nom, devise: b.devise,
      fcf: f.dernier ? f.dernier.val : null,
      cagr: f.cagr, r2: f.r2, cv: f.cv, rende: f.moyenneRendement,
      croissanceAjustee: f.croissanceAjustee, negatif: f.negatif,
      refus: f.refus || null, negatifs: f.negatifs || [], alerte: b.alerte, toutes,
      note: n ? n.note : null, note5: n5 ? n5.note : null, note10: n10 ? n10.note : null,
      detailNote: n,
    });
  }
  dernier.lignes = lignes;
  //  Les notes sont deposees la ou la page Table ira les chercher. Elles
  //  survivent au changement de page : c'est le seul lien entre les deux,
  //  le site n'ayant ni serveur ni compte.
  const notes = {};
  for (const l of lignes) {
    if (l.note5 == null && l.note10 == null) continue;
    notes[l.ticker] = { n5: l.note5, n10: l.note10, mode: selPeriode.value, quand: Date.now() };
  }
  if (Object.keys(notes).length) {
    ecrireEtat("fcf.notes", { ...lireEtat("fcf.notes", {}), ...notes });
  }
  dernier.fenetre = fenetreChoisie;
  dernier.libelleMode = mode === "annuel" ? "annual" : mode === "ttm" ? "TTM" : "quarterly";
}

/** Ramene une serie {cle: valeur} en ne gardant que le fini. */
function propre(serie) {
  const r = {};
  for (const [k, v] of Object.entries(serie || {})) {
    if (v != null && isFinite(v)) r[k] = v;
  }
  return r;
}

async function analyserTout() {
  vider(messages);
  if (!societes.length) {
    message(messages, "erreur", "Pick at least one company, or paste a list.");
    return;
  }

  const brut = [];
  const echecs = [];
  let fait = 0;

  for (const s of societes) {
    fait++;
    act.montrer(`${s.ticker} — ${fait}/${societes.length}`);
    await respirer();

    let facts;
    try {
      facts = await chargerFacts(s.cik);
    } catch (e) {
      echecs.push(`${s.ticker} (${e.message})`);
      continue;
    }

    const parMode = {};
    let devise = "USD", alerte = null;

    for (const [nom, mode] of Object.entries(MODE_DE)) {
      const rapport = { tags: [], devises: new Set(), formes: new Set(),
        derives: [], incoherences: [], anomaliesAnnuelles: [], points: 0 };
      const cache = {};
      const fcf = propre(construireSerie(facts, "fcf", mode, cache, rapport));
      if (!Object.keys(fcf).length) continue;
      devise = [...rapport.devises][0] || devise;

      //  Le rendement demande un cours : il peut manquer, ou etre refuse
      //  quand la devise de cotation differe de celle des comptes. Ce n'est
      //  pas une raison de perdre le CAGR et le R², qui n'en dependent pas.
      let rende = {};
      try {
        const r = await serieValo("fcf_yield", s.ticker, mode,
          (b) => construireSerie(facts, b, mode, cache, rapport),
          { pas: "periode", devisesComptes: rapport.devises });
        if (r.erreur) alerte = alerte || `FCF yield unavailable — ${r.erreur}`;
        rende = propre(r.serie);
      } catch (e) {
        alerte = alerte || `FCF yield unavailable — ${e.message}`;
      }
      parMode[nom] = { fcf, rende };
    }

    if (!Object.keys(parMode).length) {
      echecs.push(`${s.ticker} (no free cash flow could be built)`);
      continue;
    }
    brut.push({ ticker: s.ticker, nom: s.nom, devise, alerte, parMode });
  }

  act.cacher();
  dernier = { brut };
  calculer();
  dessinerComparaison();

  if (echecs.length) {
    message(messages, "info", `Left out: ${echecs.join(", ")}.`);
  }
}

$("#btn-analyser").addEventListener("click", () => {
  analyserTout().catch((e) => {
    act.cacher();
    message(messages, "erreur", e instanceof ErreurWorker ? e.message : `Unexpected error: ${e.message}`);
  });
});

$("#btn-csv").addEventListener("click", () => {
  if (!dernier || !dernier.lignes || !dernier.lignes.length) {
    message(messages, "erreur", "Nothing to export yet — run the analysis first.");
    return;
  }
  const lignes = [["Ticker", "Company", "Latest FCF", "FCF CAGR %", "R2", "Yield CV", "Avg yield %"]];
  for (const l of trier(dernier.lignes)) {
    lignes.push([l.ticker, l.nom,
      l.fcf == null ? "" : l.fcf,
      l.cagr == null ? "" : (l.cagr * 100).toFixed(2),
      l.r2 == null ? "" : l.r2.toFixed(4),
      l.cv == null ? "" : l.cv.toFixed(4),
      l.rende == null ? "" : l.rende.toFixed(2)]);
  }
  const csv = lignes.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  telechargerTexte(csv, `qs-fcf-${dernier.fenetre}y-${dernier.libelleMode}.csv`);
});

$("#btn-reset").addEventListener("click", () => {
  societes = [];
  dernier = null;
  dessinerSelection();
  vider(sorties);
  vider(messages);
});

dessinerSelection();
