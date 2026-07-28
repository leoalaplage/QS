// =====================================================================
//  Page "FCF" : regularite du flux de tresorerie libre
//
//  Une societe par tableau, une ligne par fenetre de 3 a 15 exercices.
// =====================================================================

import { SUGGESTIONS } from "./qs-chart-metrics.js";
import {
  chercherSocietes, chargerTickers, chargerFacts, construireSerie, MODES, ErreurWorker,
} from "./qs-chart-edgar.js";
import { serieValo } from "./qs-prix.js";
import { COULEURS } from "./qs-chart-draw.js";
import { analyser, FENETRES } from "./qs-fcf.js";
import { $, el, vider, message, statut } from "./qs-ui.js";

const messages = $("#messages");
const sorties = $("#sorties");
const act = statut($("#statut"), $("#statut-texte"));

const societes = [];

// ---------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------
function dessinerSelection() {
  const zone = $("#selection");
  vider(zone);
  $("#selection-vide").classList.toggle("cache", societes.length > 0);
  societes.forEach((s, i) => {
    const j = el("span", { classe: "jeton" });
    j.appendChild(el("span", { classe: "pastille", style: `background:${s.couleur}` }));
    j.appendChild(el("b", { texte: s.ticker }));
    j.appendChild(el("span", { classe: "nm", texte: s.nom }));
    const croix = el("button", { texte: "×", type: "button", title: `Remove ${s.ticker}` });
    croix.addEventListener("click", () => { societes.splice(i, 1); dessinerSelection(); });
    j.appendChild(croix);
    zone.appendChild(j);
  });
}

function ajouterSociete(s) {
  if (societes.some((x) => x.ticker === s.ticker)) return;
  if (societes.length >= 6) {
    message(messages, "info", "Six companies at a time keeps the tables readable.");
    return;
  }
  societes.push({ ...s, couleur: COULEURS[societes.length % COULEURS.length] });
  dessinerSelection();
}

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
    b.addEventListener("click", () => ajouterSociete({ ticker: tk, cik: e[0], nom: e[1] }));
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
      b.addEventListener("click", () => { ajouterSociete(s); champ.value = ""; fermerListe(); champ.focus(); });
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
// Mise en forme
// ---------------------------------------------------------------------
const pourcent = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)} %`);
const deuxDec = (x) => (x == null ? "—" : x.toFixed(2));

/** Montant abrege, avec sa devise. */
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
 * Teinte de fond d'une cellule, du rouge au vert.
 * `t` va de 0 (mauvais) a 1 (bon). Volontairement pale : la couleur doit
 * guider l'oeil sans rendre le chiffre penible a lire.
 */
function teinte(t) {
  if (t == null) return "";
  const c = Math.max(0, Math.min(1, t));
  const teinteHsl = 8 + c * 130;             // 8 = rouge, 138 = vert
  return `background:hsl(${teinteHsl.toFixed(0)} 62% ${(96 - c * 6).toFixed(0)}%)`;
}

// Bornes de lecture : au-dela, la couleur sature.
const echelleCagr = (x) => (x == null ? null : Math.max(0, Math.min(1, (x + 0.05) / 0.30)));
const echelleR2 = (x) => (x == null ? null : Math.max(0, Math.min(1, (x - 0.3) / 0.65)));
//  Pour le CV, PLUS BAS vaut mieux : l'echelle est inversee.
const echelleCv = (x) => (x == null ? null : 1 - Math.max(0, Math.min(1, (x - 0.1) / 0.6)));

// ---------------------------------------------------------------------
// Rendu d'une societe
// ---------------------------------------------------------------------
function tableauSociete(s, lignes, devise, alertes) {
  const carte = el("section", { classe: "carte resultat-fcf" });

  const entete = el("div", { classe: "entete-resultat" });
  entete.appendChild(el("h2", { texte: `${s.ticker} — ${s.nom}` }));
  const derniere = lignes.find((l) => l.valeurs);
  if (derniere) {
    const v = derniere.valeurs[derniere.valeurs.length - 1];
    entete.appendChild(el("span", {
      classe: "taille",
      texte: `latest FCF ${montant(v.val, devise)} (FY ${v.annee})`,
    }));
  }
  carte.appendChild(entete);

  const table = el("table", { classe: "tbl-fcf" });
  const tr = el("tr");
  for (const t of ["Window", "Years", "FCF CAGR", "R²", "FCF yield CV", "Avg yield"]) {
    tr.appendChild(el("th", { texte: t }));
  }
  table.appendChild(tr);

  for (const l of lignes) {
    const ligne = el("tr");
    ligne.appendChild(el("td", { classe: "fenetre", texte: `${l.annees}y` }));
    ligne.appendChild(el("td", { classe: "menu", texte: l.periode || "—" }));

    const cCagr = el("td", { texte: pourcent(l.cagr) });
    cCagr.setAttribute("style", teinte(echelleCagr(l.cagr)));
    if (l.cagr == null && l.periode) {
      cCagr.title = l.negatif ? "Negative FCF at one end of the window" : "Not enough data";
    }
    ligne.appendChild(cCagr);

    const cR2 = el("td", { texte: deuxDec(l.r2) });
    cR2.setAttribute("style", teinte(echelleR2(l.r2)));
    if (l.r2 != null) {
      cR2.title = `Fitted growth ${pourcent(l.croissanceAjustee)} per year`;
    } else if (l.periode) {
      cR2.title = "A negative FCF year has no logarithm";
    }
    ligne.appendChild(cR2);

    const cCv = el("td", { texte: deuxDec(l.cv) });
    cCv.setAttribute("style", teinte(echelleCv(l.cv)));
    ligne.appendChild(cCv);

    ligne.appendChild(el("td", { classe: "menu", texte: l.moyenneRendement == null ? "—"
      : `${l.moyenneRendement.toFixed(1)} %` }));

    if (!l.periode) ligne.classList.add("vide-ligne");
    table.appendChild(ligne);
  }

  const enveloppe = el("div", { classe: "table-scroll" });
  enveloppe.appendChild(table);
  carte.appendChild(enveloppe);

  if (alertes.length) {
    carte.appendChild(el("p", { classe: "aide souci", texte: alertes.join(" · ") }));
  }
  return carte;
}

// ---------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------
async function analyserTout() {
  vider(messages);
  vider(sorties);
  if (!societes.length) {
    message(messages, "erreur", "Pick at least one company.");
    return;
  }

  for (const s of societes) {
    act.montrer(`Fetching ${s.ticker} from EDGAR…`);
    const alertes = [];
    let facts;
    try {
      facts = await chargerFacts(s.cik);
    } catch (e) {
      message(messages, "erreur", `${s.ticker}: ${e.message}`);
      continue;
    }

    const rapport = { tags: [], devises: new Set(), formes: new Set(),
      derives: [], incoherences: [], anomaliesAnnuelles: [], points: 0 };
    const cache = {};
    const fcfParCle = construireSerie(facts, "fcf", MODES.ANNUEL, cache, rapport);
    const devise = [...rapport.devises][0] || "USD";

    //  Les cles annuelles sont deja des annees ; on les ramene a des nombres
    //  pour que les fenetres puissent verifier la continuite.
    const fcf = {};
    for (const [k, v] of Object.entries(fcfParCle)) {
      const a = Number(String(k).slice(0, 4));
      if (Number.isFinite(a)) fcf[a] = v;
    }
    if (!Object.keys(fcf).length) {
      message(messages, "info", `${s.ticker}: no annual free cash flow could be built from its filings.`);
      continue;
    }

    //  Le rendement demande un cours : il peut manquer, ou etre refuse quand
    //  la devise de cotation differe de celle des comptes. Ce n'est pas une
    //  raison de perdre le CAGR et le R², qui n'en dependent pas.
    act.montrer(`Fetching ${s.ticker} quotes…`);
    const rende = {};
    try {
      const r = await serieValo("fcf_yield", s.ticker, MODES.ANNUEL,
        (b) => construireSerie(facts, b, MODES.ANNUEL, cache, rapport),
        { pas: "periode", devisesComptes: rapport.devises });
      if (r.erreur) alertes.push(`FCF yield unavailable — ${r.erreur}`);
      for (const [k, v] of Object.entries(r.serie || {})) {
        const a = Number(String(k).slice(0, 4));
        if (Number.isFinite(a) && v != null && isFinite(v)) rende[a] = v;
      }
    } catch (e) {
      alertes.push(`FCF yield unavailable — ${e.message}`);
    }

    for (const inc of rapport.incoherences) alertes.push(inc);
    sorties.appendChild(tableauSociete(s, analyser(fcf, rende, FENETRES), devise, alertes));
  }

  act.cacher();
  if (sorties.children.length) {
    message(messages, "ok",
      "Read the two together: the CAGR says how fast, the R² says how steadily. "
      + "A high CAGR with a low R² was a lucky stretch, not a habit.");
  }
}

$("#btn-analyser").addEventListener("click", () => {
  analyserTout().catch((e) => {
    act.cacher();
    message(messages, "erreur", e instanceof ErreurWorker ? e.message : `Unexpected error: ${e.message}`);
  });
});

$("#btn-reset").addEventListener("click", () => {
  societes.length = 0;
  dessinerSelection();
  vider(sorties);
  vider(messages);
});

dessinerSelection();
