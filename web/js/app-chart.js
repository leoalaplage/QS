// =====================================================================
//  Page "Chart" : recherche de societe + metrique + periode -> graphe PNG
// =====================================================================

import { metriquesParCategorie, toutesLesMetriques, SUGGESTIONS } from "./qs-chart-metrics.js";
import {
  chercherSocietes, chargerTickers, chargerFacts, seriesPour, modesDisponibles,
  MODES, LIBELLES_MODES, LIBELLES_COURTS, ErreurWorker,
} from "./qs-chart-edgar.js";
import { tracer } from "./qs-chart-draw.js";
import { workerUrl, definirWorkerUrl, ANNEES_DEFAUT } from "./qs-settings.js";
import { $, el, vider, message, blocResultat, statut, respirer } from "./qs-ui.js";

const messages = $("#messages");
const sorties = $("#sorties");
const act = statut($("#statut"), $("#statut-texte"));

// ---------------------------------------------------------------------
// Menu des metriques
// ---------------------------------------------------------------------
const selMetrique = $("#metrique");
for (const [categorie, metriques] of metriquesParCategorie()) {
  if (!metriques.length) continue;
  const groupe = el("optgroup", { label: categorie });
  for (const m of metriques.sort((a, b) => a.nom.localeCompare(b.nom, "en"))) {
    groupe.appendChild(el("option", { value: m.cle, texte: m.nom }));
  }
  selMetrique.appendChild(groupe);
}
selMetrique.value = "revenue";
$("#annees").value = ANNEES_DEFAUT;

// ---------------------------------------------------------------------
// Selection de societes (jetons)
// ---------------------------------------------------------------------
const selection = [];   // [{ticker, cik, nom}]
const zoneSelection = $("#selection");
const zoneVide = $("#selection-vide");

function dessinerSelection() {
  vider(zoneSelection);
  zoneVide.classList.toggle("cache", selection.length > 0);
  for (const s of selection) {
    const jeton = el("span", { classe: "jeton" });
    jeton.appendChild(el("b", { texte: s.ticker }));
    jeton.appendChild(el("span", { classe: "nm", texte: s.nom }));
    const retirer = el("button", { texte: "×", title: `Remove ${s.ticker}`, type: "button" });
    retirer.addEventListener("click", () => {
      selection.splice(selection.indexOf(s), 1);
      dessinerSelection();
    });
    jeton.appendChild(retirer);
    zoneSelection.appendChild(jeton);
  }
}

function ajouter(societe) {
  if (selection.some((s) => s.ticker === societe.ticker)) return;
  if (selection.length >= 6) {
    message(messages, "info", "Six companies maximum on a single chart.");
    return;
  }
  selection.push(societe);
  dessinerSelection();
}

// -- suggestions rapides ----------------------------------------------
(async () => {
  const table = await chargerTickers();
  const zone = $("#suggestions-rapides");
  SUGGESTIONS.forEach((tk, i) => {
    const e = table[tk];
    if (!e) return;
    if (i) zone.appendChild(document.createTextNode(" · "));
    const b = el("button", { classe: "lien", texte: tk, type: "button", title: e[1] });
    b.addEventListener("click", () => ajouter({ ticker: tk, cik: e[0], nom: e[1] }));
    zone.appendChild(b);
  });
})();

// -- recherche live ----------------------------------------------------
const champ = $("#recherche");
const liste = $("#resultats-recherche");
let minuteur = null;

function fermerListe() { liste.classList.add("cache"); vider(liste); }

async function rechercher() {
  const q = champ.value.trim();
  if (q.length < 1) { fermerListe(); return; }
  const trouves = await chercherSocietes(q, 12);
  vider(liste);
  if (!trouves.length) {
    liste.appendChild(el("div", { classe: "vide",
      texte: `No company matches "${q}" in SEC filings.` }));
  } else {
    for (const s of trouves) {
      const b = el("button", { type: "button" });
      b.appendChild(el("span", { classe: "tk", texte: s.ticker }));
      b.appendChild(el("span", { classe: "nm", texte: s.nom }));
      b.addEventListener("click", () => {
        ajouter(s);
        champ.value = "";
        fermerListe();
        champ.focus();
      });
      liste.appendChild(b);
    }
  }
  liste.classList.remove("cache");
}

champ.addEventListener("input", () => {
  clearTimeout(minuteur);
  minuteur = setTimeout(rechercher, 120);
});
champ.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fermerListe();
  if (e.key === "Enter") {
    const premier = liste.querySelector("button");
    if (premier) { e.preventDefault(); premier.click(); }
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".champ-recherche")) fermerListe();
});

// ---------------------------------------------------------------------
// Configuration du relais
// ---------------------------------------------------------------------
const blocRelais = $("#config-relais");
const champRelais = $("#url-relais");
champRelais.value = workerUrl();

$("#btn-relais").addEventListener("click", () => blocRelais.classList.toggle("cache"));

$("#btn-enregistrer-relais").addEventListener("click", () => {
  const url = definirWorkerUrl(champRelais.value);
  champRelais.value = url;
  vider(messages);
  message(messages, "ok", url ? `Relay saved: ${url}` : "Relay cleared.");
});

if (!workerUrl()) {
  blocRelais.classList.remove("cache");
  message(messages, "info",
    "No EDGAR relay configured yet: enter your Worker URL above " +
    "(or set WORKER_URL_DEFAUT in web/js/qs-settings.js once and for all).");
}

// ---------------------------------------------------------------------
// Panneau d'audit : d'ou vient exactement chaque chiffre
// ---------------------------------------------------------------------
function panneauAudit(rapports, series, mode) {
  const bloc = el("details", { classe: "audit" });
  bloc.appendChild(el("summary", { texte: "Where does this data come from? (XBRL tags, currency, checks)" }));

  const table = el("table");
  const thead = el("tr");
  for (const t of ["Company", "XBRL tag used", "Unit", "Points", "Period covered", "Filing forms"]) {
    thead.appendChild(el("th", { texte: t }));
  }
  table.appendChild(thead);

  const remarques = [];
  for (const [tk, rap] of Object.entries(rapports)) {
    const serie = series[tk] || {};
    const cles = Object.keys(serie).sort();
    const tr = el("tr");
    tr.appendChild(el("td", {}, [el("b", { texte: tk })]));

    const cellTags = el("td");
    if (rap.tags.length) {
      rap.tags.forEach((t, i) => {
        if (i) cellTags.appendChild(el("br"));
        cellTags.appendChild(el("code", { texte: `${t.taxo}:${t.tag}` }));
        cellTags.appendChild(document.createTextNode(` (${t.points})`));
      });
    } else {
      cellTags.appendChild(el("span", { classe: "souci", texte: "no usable tag" }));
    }
    tr.appendChild(cellTags);

    tr.appendChild(el("td", { texte: rap.tags.length ? rap.tags[0].unite : "-" }));
    tr.appendChild(el("td", { texte: String(cles.length) }));
    tr.appendChild(el("td", { texte: cles.length ? `${cles[0]} → ${cles[cles.length - 1]}` : "-" }));
    tr.appendChild(el("td", { texte: [...rap.formes].sort().join(", ") || "-" }));
    table.appendChild(tr);

    if (rap.derives.length) {
      remarques.push({
        type: "drapeau",
        texte: `${tk}: ${rap.derives.length} quarter(s) reconstructed by difference with ` +
          `the fiscal year (${rap.derives.slice(0, 6).join(", ")}` +
          `${rap.derives.length > 6 ? "…" : ""}) — Q4 is never filed in a 10-Q.`,
      });
    }
    for (const inc of rap.incoherences) remarques.push({ type: "souci", texte: `${tk} : ${inc}` });
  }

  bloc.appendChild(table);

  const notes = el("div", { classe: "aide", style: "margin-top:10px" });
  notes.appendChild(el("div", {
    texte: `Mode: ${LIBELLES_MODES[mode]}. The number in brackets is how many points that ` +
      "tag contributed; several tags show up when the company changed labels over time " +
      "(for a given period, the first available one wins).",
  }));
  for (const r of remarques) {
    notes.appendChild(el("div", { classe: r.type, texte: r.texte, style: "margin-top:6px" }));
  }
  if (!remarques.length) {
    notes.appendChild(el("div", {
      texte: "No reconstructed value, no inconsistency detected.",
      style: "margin-top:6px",
    }));
  }
  bloc.appendChild(notes);
  return bloc;
}

// ---------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------
$("#btn-generer").addEventListener("click", async () => {
  vider(messages);
  vider(sorties);
  fermerListe();

  if (!selection.length) {
    message(messages, "erreur", "Pick at least one company (search by name or ticker).");
    return;
  }

  const cleMetrique = selMetrique.value;
  const mode = $("#periode").value;
  const annees = Math.max(2, Number($("#annees").value) || ANNEES_DEFAUT);
  const meta = toutesLesMetriques()[cleMetrique];

  let donnees;
  try {
    act.montrer("Fetching from EDGAR...");
    await respirer();
    donnees = await seriesPour(selection, cleMetrique, mode, (t) => act.montrer(t));
  } catch (e) {
    act.cacher();
    message(messages, "erreur",
      e instanceof ErreurWorker ? e.message : `Fetch failed: ${e.message}`);
    if (e instanceof ErreurWorker) blocRelais.classList.remove("cache");
    return;
  }

  const { series, noms, rapports, absents, devises } = donnees;

  // -- rien a tracer : expliquer precisement pourquoi -------------------
  if (!Object.keys(series).length) {
    act.montrer("Checking the other periods...");
    const alternatives = [];
    for (const s of selection) {
      try {
        const facts = await chargerFacts(s.cik);
        const dispo = modesDisponibles(facts, cleMetrique);
        const ok = Object.entries(dispo).filter(([m, n]) => n > 0 && m !== mode);
        if (ok.length) {
          alternatives.push(`${s.ticker}: available as ` +
            ok.map(([m, n]) => `${LIBELLES_COURTS[m]} (${n} points)`).join(", "));
        } else {
          alternatives.push(`${s.ticker}: this metric is not tagged in any period.`);
        }
      } catch { /* le message principal suffit */ }
    }
    act.cacher();
    message(messages, "erreur",
      `No "${meta.nom}" data in ${LIBELLES_COURTS[mode]} for ` +
      `${selection.map((s) => s.ticker).join(", ")}.`, alternatives);
    return;
  }

  act.montrer("Drawing the chart...");
  await respirer();

  const devise = devises[0] || "USD";
  let canvas;
  try {
    canvas = tracer(meta, series, noms, { anneesFenetre: annees, mode, devise });
  } catch (e) {
    act.cacher();
    message(messages, "erreur", `Chart failed: ${e.message}`);
    return;
  }
  act.cacher();

  // -- reserves ---------------------------------------------------------
  const remarques = [];
  if (absents.length) {
    remarques.push(`No "${meta.nom}" data in ${LIBELLES_COURTS[mode]} ` +
      `for: ${absents.join(", ")}.`);
  }
  if (devises.length > 1 && ["money", "per_share"].includes(meta.unite)) {
    remarques.push(
      `Careful: these companies do not report in the same currency ` +
      `(${devises.join(", ")}). The curves are not comparable as they stand — ` +
      "the axis is scaled in " + devise + ".");
  }

  // Les incoherences ne doivent PAS dormir dans un panneau replie : un ecart
  // de 20 % entre la somme des trimestres et l'exercice publie doit sauter
  // aux yeux avant que le graphe ne serve a decider quoi que ce soit.
  const alertes = [];
  for (const [tk, rap] of Object.entries(rapports)) {
    for (const inc of rap.incoherences) alertes.push(`${tk}: ${inc}`);
  }
  if (alertes.length) {
    message(messages, "erreur",
      "Consistency check: the reported data is not homogeneous across the whole period " +
      "(accounting restatement or XBRL tag change). Details under \"Where does this data " +
      "come from?\" below the chart.", alertes);
  }
  if (remarques.length) message(messages, "info", "Chart generated, with caveats:", remarques);

  const suffixe = mode === MODES.ANNUEL ? "" : `_${mode}`;
  const nomFichier = `QS_Chart_${Object.keys(series).join("_")}_${cleMetrique}${suffixe}.png`;
  const bloc = blocResultat(canvas, { titre: `${meta.nom} — ${LIBELLES_MODES[mode]}`, nomFichier });
  bloc.appendChild(panneauAudit(rapports, series, mode));
  sorties.appendChild(bloc);
  sorties.scrollIntoView({ behavior: "smooth", block: "start" });
});
