// =====================================================================
//  QS S&P 500 - screener sur l'index pre-calcule, puis fiche a la demande
// =====================================================================

import { $, el, vider, message, telechargerTexte } from "./qs-ui.js";

const URL_INDEX = new URL("../data/univers/index.json", import.meta.url);
const PAR_PAGE = 50;
const cacheFiches = new Map();

const METRIQUES_PULSE = [
  ["roic", 35],
  ["fcf_margin", 25],
  ["fcf_cagr5", 20],
  ["revenue_cagr5", 10],
  ["operating_margin", 10],
];

const LIBELLES_TRI = {
  pulse: "Quality pulse",
  roic: "ROIC",
  fcf_margin: "FCF margin",
  fcf_cagr5: "FCF CAGR 5y",
  revenue_cagr5: "Revenue CAGR 5y",
  operating_margin: "Operating margin",
  exercices: "Annual history",
  ticker: "Ticker",
  nom: "Company",
};

const state = {
  index: null,
  lignes: [],
  filtrees: [],
  tri: "pulse",
  direction: "desc",
  page: 1,
  fiche: null,
  requeteFiche: 0,
};

const fini = (v) => typeof v === "number" && Number.isFinite(v);

function nomLisible(nom = "") {
  if (!nom || nom !== nom.toUpperCase()) return nom;
  return nom.toLocaleLowerCase("en-US").replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bInc\.?$/i, "Inc.").replace(/\bPlc\b/i, "plc");
}

function percentile(sorted, valeur) {
  if (!fini(valeur) || !sorted.length) return null;
  let bas = 0, haut = sorted.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (sorted[m] < valeur) bas = m + 1; else haut = m;
  }
  const premier = bas;
  haut = sorted.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (sorted[m] <= valeur) bas = m + 1; else haut = m;
  }
  const dernier = bas - 1;
  if (sorted.length === 1) return 100;
  return ((premier + dernier) / 2) / (sorted.length - 1) * 100;
}

function ajouterPulse(lignes) {
  const distributions = {};
  for (const [cle] of METRIQUES_PULSE) {
    distributions[cle] = lignes.map((l) => l[cle]).filter(fini).sort((a, b) => a - b);
  }
  return lignes.map((ligne) => {
    let total = 0, poids = 0, presentes = 0;
    for (const [cle, p] of METRIQUES_PULSE) {
      const rang = percentile(distributions[cle], ligne[cle]);
      if (rang === null) continue;
      total += rang * p;
      poids += p;
      presentes++;
    }
    return {
      ...ligne,
      nom_affiche: nomLisible(ligne.nom),
      pulse: presentes >= 3 ? total / poids : null,
      pulse_donnees: presentes,
    };
  });
}

function nombre(id) {
  const texte = $(`#${id}`).value.trim();
  if (texte === "") return null;
  const n = Number(texte);
  return Number.isFinite(n) ? n : null;
}

function normaliser(texte) {
  return (texte || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function appliquerFiltres() {
  const q = normaliser($("#recherche").value.trim());
  const secteur = $("#secteur").value;
  const seuils = {
    pulse: nombre("min-pulse"),
    roic: nombre("min-roic"),
    fcf_margin: nombre("min-fcf-margin"),
    fcf_cagr5: nombre("min-fcf-cagr"),
    revenue_cagr5: nombre("min-revenue-cagr"),
    exercices: nombre("min-history"),
  };

  state.filtrees = state.lignes.filter((l) => {
    if (secteur && l.secteur !== secteur) return false;
    if (q && !normaliser(`${l.ticker} ${l.nom} ${l.secteur} ${l.industrie}`).includes(q)) return false;
    for (const [cle, minimum] of Object.entries(seuils)) {
      if (minimum !== null && (!fini(l[cle]) || l[cle] < minimum)) return false;
    }
    return true;
  });

  trier();
  const pages = Math.max(1, Math.ceil(state.filtrees.length / PAR_PAGE));
  state.page = Math.min(state.page, pages);
  afficherTable();
}

function trier() {
  const cle = state.tri;
  const sens = state.direction === "asc" ? 1 : -1;
  state.filtrees.sort((a, b) => {
    const av = a[cle], bv = b[cle];
    const am = av === null || av === undefined || (typeof av === "number" && !Number.isFinite(av));
    const bm = bv === null || bv === undefined || (typeof bv === "number" && !Number.isFinite(bv));
    if (am !== bm) return am ? 1 : -1;
    if (am) return a.ticker.localeCompare(b.ticker);
    if (typeof av === "string") return av.localeCompare(bv) * sens;
    return (av - bv) * sens || a.ticker.localeCompare(b.ticker);
  });
}

const pct = (v) => fini(v) ? `${v.toFixed(1)}%` : "—";
const entier = (v) => fini(v) ? String(Math.round(v)) : "—";

function classePulse(v) {
  if (!fini(v)) return "neutre";
  if (v >= 75) return "haut";
  if (v < 35) return "bas";
  return "moyen";
}

function cellule(texte, classe = "") {
  return el("td", { classe, texte });
}

function afficherTable() {
  const corps = $("#lignes-univers");
  vider(corps);
  const debut = (state.page - 1) * PAR_PAGE;
  const page = state.filtrees.slice(debut, debut + PAR_PAGE);

  for (const [i, l] of page.entries()) {
    const tr = el("tr", { tabindex: "0", role: "button", "aria-label": `Open ${l.ticker} details` });
    tr.appendChild(cellule(String(debut + i + 1), "rang"));

    const societe = el("td", { classe: "societe-univers" });
    const identite = el("div", { classe: "identite-societe" });
    identite.appendChild(el("span", { classe: "ticker-univers", texte: l.ticker }));
    identite.appendChild(el("span", { classe: "nom-univers", texte: l.nom_affiche }));
    societe.appendChild(identite);
    societe.appendChild(el("div", { classe: "industrie-univers", texte: `${l.secteur} · ${l.industrie || "Industry not reported"}` }));
    tr.appendChild(societe);

    const pulse = el("td", { classe: "num" });
    pulse.appendChild(el("span", {
      classe: `score-pulse ${classePulse(l.pulse)}`,
      texte: entier(l.pulse),
      title: `${l.pulse_donnees}/5 pulse metrics available`,
    }));
    tr.appendChild(pulse);
    tr.appendChild(cellule(pct(l.roic), "num"));
    tr.appendChild(cellule(pct(l.fcf_margin), "num"));
    tr.appendChild(cellule(pct(l.fcf_cagr5), "num"));
    tr.appendChild(cellule(pct(l.revenue_cagr5), "num"));
    tr.appendChild(cellule(pct(l.operating_margin), "num"));
    tr.appendChild(cellule(fini(l.exercices) ? `${l.exercices}y` : "—", "num"));

    tr.addEventListener("click", () => ouvrirFiche(l));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrirFiche(l); }
    });
    corps.appendChild(tr);
  }

  if (!page.length) {
    const tr = el("tr");
    const td = cellule("No company matches these filters.", "table-vide");
    td.colSpan = 9;
    tr.appendChild(td);
    corps.appendChild(tr);
  }

  const totalPages = Math.max(1, Math.ceil(state.filtrees.length / PAR_PAGE));
  $("#etat-page").textContent = `Page ${state.page} of ${totalPages}`;
  $("#page-precedente").disabled = state.page <= 1;
  $("#page-suivante").disabled = state.page >= totalPages;
  $("#compte-resultats").textContent = `${state.filtrees.length} of ${state.lignes.length} companies`;

  for (const th of document.querySelectorAll(".table-univers th[data-tri]")) {
    const actif = th.dataset.tri === state.tri;
    th.classList.toggle("tri-actif", actif);
    th.setAttribute("aria-sort", actif ? (state.direction === "asc" ? "ascending" : "descending") : "none");
  }
}

function afficherResume() {
  const conteneur = $("#resume-univers");
  vider(conteneur);
  const secteurs = new Set(state.lignes.map((l) => l.secteur).filter(Boolean));
  const avecFcf = state.lignes.filter((l) => fini(l.fcf_cagr5)).length;
  const date = new Date(state.index.genere);
  const valeurs = [
    [state.index.societes, "companies covered"],
    [secteurs.size, "GICS sectors"],
    [`${Math.round(avecFcf / state.lignes.length * 100)}%`, "with 5y FCF growth"],
    [date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), "latest ingestion"],
  ];
  for (const [valeur, libelle] of valeurs) {
    conteneur.appendChild(el("div", { classe: "stat-univers" }, [
      el("strong", { texte: String(valeur) }), el("span", { texte: libelle }),
    ]));
  }

  const ageJours = (Date.now() - date.getTime()) / 86400000;
  const badge = $("#fraicheur");
  badge.textContent = `Updated ${date.toLocaleString("en-US", { dateStyle: "medium", timeZone: "UTC" })}`;
  badge.classList.toggle("retard", ageJours > 2.5);
}

function remplirSecteurs() {
  const select = $("#secteur");
  const secteurs = [...new Set(state.lignes.map((l) => l.secteur).filter(Boolean))].sort();
  for (const s of secteurs) select.appendChild(el("option", { value: s, texte: s }));
}

function csvFiltre() {
  const colonnes = ["ticker", "nom", "secteur", "industrie", "pulse", "roic", "fcf_margin",
    "fcf_cagr5", "revenue_cagr5", "operating_margin", "net_margin", "exercices"];
  const echapper = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [colonnes.join(","), ...state.filtrees.map((l) => colonnes.map((c) => echapper(l[c])).join(","))].join("\n");
}

// ---------------------------------------------------------------------
// Fiche societe : un seul JSON est charge au clic.
// ---------------------------------------------------------------------
const DETAIL_METRIQUES = [
  ["revenue", "Revenue", "money"],
  ["fcf", "Free cash flow", "money"],
  ["roic", "ROIC", "pct"],
  ["fcf_margin", "FCF margin", "pct"],
  ["operating_margin", "Operating margin", "pct"],
  ["net_margin", "Net margin", "pct"],
  ["fcf_conversion", "FCF conversion", "pct"],
  ["roe", "Return on equity", "pct"],
  ["current_ratio", "Current ratio", "ratio"],
  ["debt_to_equity", "Debt / equity", "ratio"],
  ["interest_coverage", "Interest coverage", "ratio"],
  ["sbc_revenue", "SBC / revenue", "pct"],
];

const HISTORIQUE_METRIQUES = [
  ["revenue", "Revenue", "money"],
  ["fcf", "FCF", "money"],
  ["roic", "ROIC", "pct"],
  ["fcf_margin", "FCF margin", "pct"],
  ["operating_margin", "Op. margin", "pct"],
];

function dernier(serie) {
  const periodes = Object.keys(serie || {}).sort();
  if (!periodes.length) return null;
  const periode = periodes[periodes.length - 1];
  return { periode, valeur: serie[periode] };
}

function formatMontant(v, devise) {
  if (!fini(v)) return "—";
  const abs = Math.abs(v);
  const [div, suffixe] = abs >= 1e12 ? [1e12, "tn"] : abs >= 1e9 ? [1e9, "bn"] : abs >= 1e6 ? [1e6, "m"] : [1, ""];
  const n = v / div;
  return `${devise} ${n.toLocaleString("en-US", { maximumFractionDigits: abs >= 1e9 ? 1 : 0 })}${suffixe}`;
}

function formatDetail(v, unite, devise) {
  if (!fini(v)) return "—";
  if (unite === "money") return formatMontant(v, devise);
  if (unite === "pct") return `${v.toFixed(1)}%`;
  return `${v.toFixed(2)}×`;
}

async function chargerFiche(ticker) {
  if (cacheFiches.has(ticker)) return cacheFiches.get(ticker);
  const r = await fetch(new URL(`../data/univers/${encodeURIComponent(ticker)}.json`, import.meta.url));
  if (!r.ok) throw new Error(`Company file returned HTTP ${r.status}`);
  const fiche = await r.json();
  cacheFiches.set(ticker, fiche);
  return fiche;
}

async function ouvrirFiche(ligne) {
  const dialogue = $("#fiche-societe");
  state.requeteFiche++;
  const requete = state.requeteFiche;
  $("#fiche-ticker").textContent = ligne.ticker;
  $("#fiche-nom").textContent = ligne.nom_affiche;
  $("#fiche-sous-titre").textContent = `${ligne.secteur} · ${ligne.industrie || "Industry not reported"}`;
  $("#fiche-chargement").classList.remove("cache");
  $("#fiche-contenu").classList.add("cache");
  $("#fiche-erreur").classList.add("cache");
  if (!dialogue.open) dialogue.showModal();

  try {
    const fiche = await chargerFiche(ligne.ticker);
    if (requete !== state.requeteFiche) return;
    state.fiche = fiche;
    $("#fiche-maille").value = "annuel";
    afficherFiche();
    $("#fiche-chargement").classList.add("cache");
    $("#fiche-contenu").classList.remove("cache");
  } catch (e) {
    if (requete !== state.requeteFiche) return;
    $("#fiche-chargement").classList.add("cache");
    const erreur = $("#fiche-erreur");
    erreur.textContent = `Could not load this company: ${e.message}`;
    erreur.classList.remove("cache");
  }
}

function afficherFiche() {
  const fiche = state.fiche;
  if (!fiche) return;
  const maille = $("#fiche-maille").value;
  const series = fiche.series[maille] || {};
  const kpis = $("#fiche-kpis");
  vider(kpis);

  let points = 0;
  for (const [cle, libelle, unite] of DETAIL_METRIQUES) {
    const d = dernier(series[cle]);
    if (d) points++;
    const carte = el("div", { classe: "kpi-societe" });
    carte.appendChild(el("span", { texte: libelle }));
    carte.appendChild(el("strong", { texte: d ? formatDetail(d.valeur, unite, fiche.devise) : "—" }));
    carte.appendChild(el("small", { texte: d ? d.periode : "Not reported" }));
    kpis.appendChild(carte);
  }
  $("#fiche-points").textContent = `${points}/${DETAIL_METRIQUES.length} headline metrics available`;

  const periodes = [...new Set(HISTORIQUE_METRIQUES.flatMap(([cle]) => Object.keys(series[cle] || {})))]
    .sort().slice(-6);
  const table = $("#fiche-historique");
  vider(table);
  const thead = el("thead");
  const hr = el("tr");
  hr.appendChild(el("th", { texte: "Metric" }));
  for (const p of periodes) hr.appendChild(el("th", { texte: p }));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = el("tbody");
  for (const [cle, libelle, unite] of HISTORIQUE_METRIQUES) {
    const tr = el("tr");
    tr.appendChild(el("th", { texte: libelle }));
    for (const p of periodes) tr.appendChild(cellule(formatDetail(series[cle]?.[p], unite, fiche.devise), "num"));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const notes = fiche.alertes || [];
  $("#fiche-alertes").classList.toggle("cache", !notes.length);
  const liste = $("#fiche-liste-alertes");
  vider(liste);
  for (const note of notes) liste.appendChild(el("li", { texte: note }));
}

// ---------------------------------------------------------------------
// Evenements et demarrage
// ---------------------------------------------------------------------
for (const id of ["recherche", "secteur", "min-pulse", "min-roic", "min-fcf-margin",
  "min-fcf-cagr", "min-revenue-cagr", "min-history"]) {
  const champ = $(`#${id}`);
  champ.addEventListener(id === "recherche" ? "input" : "change", () => {
    state.page = 1;
    appliquerFiltres();
  });
}

$("#tri").addEventListener("change", (e) => {
  state.tri = e.target.value;
  state.direction = state.tri === "nom" ? "asc" : "desc";
  state.page = 1;
  appliquerFiltres();
});

for (const th of document.querySelectorAll(".table-univers th[data-tri]")) {
  th.tabIndex = 0;
  th.addEventListener("click", () => {
    const cle = th.dataset.tri;
    state.direction = state.tri === cle && state.direction === "desc" ? "asc" : "desc";
    state.tri = cle;
    $("#tri").value = Object.hasOwn(LIBELLES_TRI, cle) ? cle : "pulse";
    state.page = 1;
    appliquerFiltres();
  });
  th.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); th.click(); }
  });
}

$("#page-precedente").addEventListener("click", () => { state.page--; afficherTable(); });
$("#page-suivante").addEventListener("click", () => { state.page++; afficherTable(); });

$("#btn-reset").addEventListener("click", () => {
  for (const id of ["recherche", "min-pulse", "min-roic", "min-fcf-margin", "min-fcf-cagr",
    "min-revenue-cagr", "min-history"]) $(`#${id}`).value = "";
  $("#secteur").value = "";
  $("#tri").value = "pulse";
  state.tri = "pulse";
  state.direction = "desc";
  state.page = 1;
  appliquerFiltres();
});

$("#btn-csv").addEventListener("click", () => telechargerTexte(csvFiltre(), "QS_SP500_filtered.csv"));
$("#fermer-fiche").addEventListener("click", () => $("#fiche-societe").close());
$("#fiche-maille").addEventListener("change", afficherFiche);
$("#fiche-societe").addEventListener("click", (e) => {
  if (e.target === $("#fiche-societe")) $("#fiche-societe").close();
});

async function demarrer() {
  try {
    const r = await fetch(URL_INDEX, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Universe index returned HTTP ${r.status}`);
    state.index = await r.json();
    state.lignes = ajouterPulse(state.index.lignes || []);
    remplirSecteurs();
    afficherResume();
    appliquerFiltres();
    if (state.index.echecs?.length) {
      message($("#messages"), "info", `${state.index.societes} companies available.`,
        state.index.echecs.map((e) => `Not yet covered: ${e}`));
    }
  } catch (e) {
    $("#fraicheur").textContent = "Data unavailable";
    $("#fraicheur").classList.add("retard");
    message($("#messages"), "erreur", `Could not load the S&P 500 universe: ${e.message}`);
  }
}

demarrer();
