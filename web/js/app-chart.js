// =====================================================================
//  Page "Chart" : societes x metriques -> graphe interactif + PNG
// =====================================================================

import {
  metriquesParCategorie, toutesLesMetriques, BASE, DERIVE, CATEGORIES, SUGGESTIONS,
} from "./qs-chart-metrics.js";
import {
  chercherSocietes, chargerTickers, chargerFacts, construireSerie, modesDisponibles,
  decoderCle, MODES, LIBELLES_MODES, LIBELLES_COURTS, ErreurWorker,
} from "./qs-chart-edgar.js";
import { tracer, etiquetteValeur, familleUnite, COULEURS } from "./qs-chart-draw.js";
import { workerUrl, definirWorkerUrl } from "./qs-settings.js";
import {
  $, el, vider, message, statut, respirer, telechargerCanvas, copierCanvas,
} from "./qs-ui.js";

const messages = $("#messages");
const sorties = $("#sorties");
const act = statut($("#statut"), $("#statut-texte"));

const societes = [];   // [{ticker, cik, nom, visible}]
const metriques = [];  // [{cle, nom, unite, graph, visible}]

// ---------------------------------------------------------------------
// Menu des metriques
// ---------------------------------------------------------------------
const selMetrique = $("#metrique");
for (const [categorie, liste] of metriquesParCategorie()) {
  if (!liste.length) continue;
  const groupe = el("optgroup", { label: categorie });
  for (const m of liste.sort((a, b) => a.nom.localeCompare(b.nom, "en"))) {
    groupe.appendChild(el("option", { value: m.cle, texte: m.nom }));
  }
  selMetrique.appendChild(groupe);
}
selMetrique.value = "revenue";

// ---------------------------------------------------------------------
// Jetons : societes et metriques, masquables sans etre supprimes
// ---------------------------------------------------------------------
function jeton({ titre, sousTitre, entree, onBascule, onRetrait }) {
  const j = el("span", { classe: `jeton${entree.visible ? "" : " masque"}` });
  j.appendChild(el("b", { texte: titre }));
  if (sousTitre) j.appendChild(el("span", { classe: "nm", texte: sousTitre }));

  const oeil = el("button", {
    classe: "oeil", type: "button",
    texte: entree.visible ? "◉" : "◎",
    title: entree.visible ? `Hide ${titre}` : `Show ${titre}`,
  });
  oeil.addEventListener("click", onBascule);
  j.appendChild(oeil);

  const croix = el("button", { texte: "×", type: "button", title: `Remove ${titre}` });
  croix.addEventListener("click", onRetrait);
  j.appendChild(croix);
  return j;
}

function dessinerSelections() {
  const zs = $("#selection");
  vider(zs);
  $("#selection-vide").classList.toggle("cache", societes.length > 0);
  for (const s of societes) {
    zs.appendChild(jeton({
      titre: s.ticker, sousTitre: s.nom, entree: s,
      onBascule: () => { s.visible = !s.visible; dessinerSelections(); rafraichir(); },
      onRetrait: () => { societes.splice(societes.indexOf(s), 1); dessinerSelections(); rafraichir(); },
    }));
  }

  const zm = $("#metriques");
  vider(zm);
  for (const m of metriques) {
    zm.appendChild(jeton({
      titre: m.nom, entree: m,
      onBascule: () => { m.visible = !m.visible; dessinerSelections(); rafraichir(); },
      onRetrait: () => { metriques.splice(metriques.indexOf(m), 1); dessinerSelections(); rafraichir(); },
    }));
  }

  // Au-dela de deux familles d'unites, plus rien ne peut etre gradue honnetement.
  const familles = [...new Set(metriques.filter((m) => m.visible).map((m) => familleUnite(m.unite)))];
  const note = $("#note-axes");
  if (familles.length > 2) {
    note.textContent = "Three different unit families selected ($, %, ratio…): only the first two "
      + "get an axis. Drop one metric so every curve stays readable.";
    note.className = "aide souci";
  } else if (familles.length === 2) {
    note.textContent = "Two unit families: the first is scaled on the left axis, the second on the right.";
    note.className = "aide";
  } else {
    note.textContent = "";
  }
}

function ajouterSociete(s) {
  if (societes.some((x) => x.ticker === s.ticker)) return;
  if (societes.length >= 6) {
    message(messages, "info", "Six companies maximum on a single chart.");
    return;
  }
  societes.push({ ...s, visible: true });
  dessinerSelections();
}

function ajouterMetrique(cle) {
  if (metriques.some((m) => m.cle === cle)) return;
  if (metriques.length >= 4) {
    message(messages, "info", "Four metrics maximum on a single chart.");
    return;
  }
  const d = toutesLesMetriques()[cle];
  metriques.push({ cle, nom: d.nom, unite: d.unite, graph: d.graph, visible: true });
  dessinerSelections();
}

$("#btn-ajout-metrique").addEventListener("click", () => ajouterMetrique(selMetrique.value));
ajouterMetrique("revenue");

// ---------------------------------------------------------------------
// Suggestions et recherche
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
// Presets de duree
// ---------------------------------------------------------------------
const DUREES = [["1Y", 1], ["3Y", 3], ["5Y", 5], ["10Y", 10], ["15Y", 15], ["Max", 40]];
const zonePresets = $("#presets-duree");
const champAnnees = $("#annees");

function majPresets() {
  const v = Number(champAnnees.value);
  for (const b of zonePresets.children) b.classList.toggle("actif", Number(b.dataset.annees) === v);
}
for (const [libelle, n] of DUREES) {
  const b = el("button", { type: "button", texte: libelle, "data-annees": n });
  b.addEventListener("click", () => { champAnnees.value = n; majPresets(); rafraichir(); });
  zonePresets.appendChild(b);
}
champAnnees.addEventListener("input", majPresets);
majPresets();

// ---------------------------------------------------------------------
// Relais
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
  message(messages, "info", "No EDGAR relay configured yet: enter your Worker URL above.");
}

// ---------------------------------------------------------------------
// Facts, mis en cache par societe
// ---------------------------------------------------------------------
const cacheFacts = new Map();
async function factsDe(s) {
  if (!cacheFacts.has(s.cik)) cacheFacts.set(s.cik, await chargerFacts(s.cik));
  return cacheFacts.get(s.cik);
}

// ---------------------------------------------------------------------
// Infobulle : retrouve la periode survolee et affiche toutes les valeurs
// ---------------------------------------------------------------------
function brancherSurvol(zone, canvas, geo) {
  const bulle = el("div", { classe: "infobulle cache" });
  const trait = el("div", { classe: "trait-survol cache" });
  zone.appendChild(trait);
  zone.appendChild(bulle);

  const cacher = () => { bulle.classList.add("cache"); trait.classList.add("cache"); };
  canvas.addEventListener("mouseleave", cacher);

  canvas.addEventListener("mousemove", (ev) => {
    const r = canvas.getBoundingClientRect();
    // largeur nulle = element pas encore mis en page (onglet masque) : on
    // s'abstient plutot que de diviser par zero et de placer l'infobulle
    // n'importe ou.
    if (!r.width) { cacher(); return; }
    const ratio = canvas.width / r.width;   // le canvas est affiche redimensionne
    const xCanvas = (ev.clientX - r.left) * ratio;
    if (xCanvas < geo.gauche || xCanvas > geo.droite) { cacher(); return; }

    let meilleure = null, meilleurEcart = Infinity;
    for (const x of geo.abscisses) {
      const ecart = Math.abs(geo.xPx(x) - xCanvas);
      if (ecart < meilleurEcart) { meilleurEcart = ecart; meilleure = x; }
    }
    if (meilleure === null) { cacher(); return; }

    const rangees = [];
    let etiquettePeriode = "";
    for (const s of geo.series) {
      const p = s.points.find((q) => q.x === meilleure);
      if (!p) continue;
      etiquettePeriode = p.etiquette;
      rangees.push({ couleur: s.couleur, libelle: s.libelle, valeur: etiquetteValeur(p.y, s.unite, s.devise) });
    }
    if (!rangees.length) { cacher(); return; }

    vider(bulle);
    bulle.appendChild(el("div", { classe: "periode", texte: etiquettePeriode }));
    for (const rg of rangees) {
      const ligne = el("div", { classe: "rangee" });
      ligne.appendChild(el("span", { classe: "pastille", style: `background:${rg.couleur}` }));
      ligne.appendChild(el("span", { texte: rg.libelle }));
      ligne.appendChild(el("span", { classe: "val", texte: rg.valeur }));
      bulle.appendChild(ligne);
    }

    const xAffiche = geo.xPx(meilleure) / ratio;
    bulle.style.left = `${xAffiche}px`;
    bulle.style.top = `${geo.haut / ratio}px`;
    trait.style.left = `${xAffiche}px`;
    trait.style.top = `${geo.haut / ratio}px`;
    trait.style.height = `${(geo.bas - geo.haut) / ratio}px`;
    bulle.classList.remove("cache");
    trait.classList.remove("cache");
  });
}

// ---------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------
let dejaGenere = false;

async function rafraichir() {
  if (dejaGenere) await generer({ silencieux: true });
}

async function generer({ silencieux = false } = {}) {
  if (!silencieux) vider(messages);
  vider(sorties);

  const soc = societes.filter((s) => s.visible);
  const met = metriques.filter((m) => m.visible);
  if (!soc.length || !met.length) {
    if (!silencieux) {
      message(messages, "erreur", !soc.length
        ? "Pick at least one company (search by name or ticker)."
        : "Add at least one metric.");
    }
    return;
  }

  const mode = $("#periode").value;
  const annees = Math.max(1, Number(champAnnees.value) || 15);
  const typeChoisi = $("#type-graphe").value;
  const overlays = { moyenne: $("#ov-moyenne").checked, extremes: $("#ov-extremes").checked };

  // -- collecte --------------------------------------------------------
  const brut = [];
  const rapports = {};
  try {
    for (const s of soc) {
      act.montrer(`Fetching ${s.ticker} from EDGAR...`);
      await respirer();
      const facts = await factsDe(s);
      const cache = {};
      for (const m of met) {
        const rapport = {
          tags: [], devises: new Set(), formes: new Set(),
          derives: [], incoherences: [], points: 0,
        };
        const serie = construireSerie(facts, m.cle, mode, cache, rapport);
        rapport.points = Object.keys(serie).length;
        rapports[`${s.ticker}|${m.cle}`] = { rapport, societe: s, metrique: m };
        brut.push({ societe: s, metrique: m, serie, rapport });
      }
    }
  } catch (e) {
    act.cacher();
    message(messages, "erreur", e instanceof ErreurWorker ? e.message : `Fetch failed: ${e.message}`);
    if (e instanceof ErreurWorker) blocRelais.classList.remove("cache");
    return;
  }

  // -- fenetre temporelle ----------------------------------------------
  let xMax = -Infinity;
  for (const b of brut) for (const k of Object.keys(b.serie)) xMax = Math.max(xMax, decoderCle(k).x);
  const trimestriel = mode !== MODES.ANNUEL;
  const xMinFenetre = xMax - annees + (trimestriel ? 0.25 : 1);

  // -- series tracees ---------------------------------------------------
  const series = [];
  const vides = [];
  brut.forEach((b, i) => {
    const points = Object.keys(b.serie)
      .map((k) => ({ ...decoderCle(k), y: b.serie[k] }))
      .filter((p) => p.x >= xMinFenetre - 1e-9 && p.y != null && isFinite(p.y))
      .sort((a, c) => a.x - c.x);
    if (!points.length) { vides.push(`${b.societe.ticker} — ${b.metrique.nom}`); return; }
    const type = typeChoisi === "auto"
      ? (b.metrique.graph === "bar" && brut.length === 1 && !trimestriel ? "bar" : "line")
      : typeChoisi;
    series.push({
      id: `${b.societe.ticker}|${b.metrique.cle}`,
      libelle: (soc.length > 1 && met.length > 1) ? `${b.societe.ticker} · ${b.metrique.nom}`
        : met.length > 1 ? b.metrique.nom : b.societe.ticker,
      points,
      unite: b.metrique.unite,
      devise: [...b.rapport.devises][0] || "USD",
      couleur: COULEURS[i % COULEURS.length],
      type,
    });
  });

  if (!series.length) {
    act.cacher();
    const alternatives = [];
    for (const s of soc) {
      try {
        const facts = await factsDe(s);
        for (const m of met) {
          const dispo = modesDisponibles(facts, m.cle);
          const ok = Object.entries(dispo).filter(([md, n]) => n > 0 && md !== mode);
          alternatives.push(ok.length
            ? `${s.ticker} — ${m.nom}: available as ${ok.map(([md, n]) => `${LIBELLES_COURTS[md]} (${n} points)`).join(", ")}`
            : `${s.ticker} — ${m.nom}: not tagged in any period.`);
        }
      } catch { /* le message principal suffit */ }
    }
    message(messages, "erreur",
      `No data in ${LIBELLES_COURTS[mode]} over the last ${annees} year(s) for this selection.`,
      alternatives);
    return;
  }

  // -- trace -------------------------------------------------------------
  act.montrer("Drawing the chart...");
  await respirer();

  const suffixe = mode === MODES.TTM ? " — TTM" : mode === MODES.TRIMESTRE ? " — quarterly" : "";
  const titre = (met.length === 1 ? met[0].nom : met.map((m) => m.nom).join(" / "))
    + suffixe + " — " + soc.map((s) => s.ticker).join(", ");

  let rendu;
  try {
    rendu = tracer({
      series, titre, overlays,
      sousAxeX: trimestriel ? "Period (calendar quarter of period end)" : "Fiscal year",
    });
  } catch (e) {
    act.cacher();
    message(messages, "erreur", `Chart failed: ${e.message}`);
    return;
  }
  act.cacher();
  dejaGenere = true;

  // -- messages ----------------------------------------------------------
  if (silencieux) vider(messages);
  const alertes = [];
  for (const { rapport, societe, metrique } of Object.values(rapports)) {
    for (const inc of rapport.incoherences) alertes.push(`${societe.ticker} — ${metrique.nom}: ${inc}`);
  }
  if (alertes.length) {
    message(messages, "erreur",
      "Consistency check: the reported data is not homogeneous across the whole period "
      + "(accounting restatement or XBRL tag change). Details under \"Where does this data come from?\".",
      alertes);
  }
  const devises = [...new Set(series.map((s) => s.devise))];
  const reserves = [];
  if (vides.length) reserves.push(`No data in ${LIBELLES_COURTS[mode]} for: ${vides.join(", ")}.`);
  if (devises.length > 1 && series.some((s) => familleUnite(s.unite) === "money")) {
    reserves.push(`Mixed reporting currencies (${devises.join(", ")}): amounts are not comparable as they stand.`);
  }
  if (reserves.length) message(messages, "info", "Chart generated, with caveats:", reserves);

  sorties.appendChild(blocGraphe(rendu, series, rapports, mode));
  if (!silencieux) sorties.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#btn-generer").addEventListener("click", () => generer());
for (const id of ["#periode", "#type-graphe", "#ov-moyenne", "#ov-extremes"]) {
  $(id).addEventListener("change", rafraichir);
}
champAnnees.addEventListener("change", rafraichir);

// ---------------------------------------------------------------------
// Bloc de resultat
// ---------------------------------------------------------------------
function blocGraphe({ canvas, geo }, series, rapports, mode) {
  const section = el("section", { classe: "carte resultat" });

  const entete = el("div", { classe: "entete-resultat" });
  entete.appendChild(el("h2", { texte: LIBELLES_MODES[mode] }));
  entete.appendChild(el("span", {
    classe: "taille",
    texte: `${canvas.width} x ${canvas.height} px — hover the chart to read values`,
  }));
  section.appendChild(entete);

  const apercu = el("div", { classe: "apercu zone-graphe" });
  apercu.appendChild(canvas);
  section.appendChild(apercu);
  brancherSurvol(apercu, canvas, geo);

  const actions = el("div", { classe: "ligne-actions" });
  const nomFichier = `QS_Chart_${series.map((s) => s.id.replace("|", "-")).join("_")}.png`
    .replace(/[^\w.-]/g, "_");
  const dl = el("button", { classe: "primaire", texte: "Download PNG" });
  dl.addEventListener("click", () => telechargerCanvas(canvas, nomFichier));
  actions.appendChild(dl);
  const cp = el("button", { texte: "Copy image" });
  cp.addEventListener("click", async () => {
    const ok = await copierCanvas(canvas);
    cp.textContent = ok ? "Copied!" : "Copy blocked by the browser";
    setTimeout(() => { cp.textContent = "Copy image"; }, 2200);
  });
  actions.appendChild(cp);
  section.appendChild(actions);

  section.appendChild(panneauAudit(rapports, mode));
  return section;
}

function panneauAudit(rapports, mode) {
  const bloc = el("details", { classe: "audit" });
  bloc.appendChild(el("summary", { texte: "Where does this data come from? (XBRL tags, currency, checks)" }));

  const table = el("table");
  const thead = el("tr");
  for (const t of ["Series", "XBRL tag used", "Unit", "Points", "Filing forms", "Rebuilt quarters"]) {
    thead.appendChild(el("th", { texte: t }));
  }
  table.appendChild(thead);

  for (const { rapport, societe, metrique } of Object.values(rapports)) {
    const tr = el("tr");
    const c1 = el("td");
    c1.appendChild(el("b", { texte: societe.ticker }));
    c1.appendChild(el("span", { classe: "nm", texte: ` ${metrique.nom}` }));
    tr.appendChild(c1);

    const cellTags = el("td");
    if (rapport.tags.length) {
      rapport.tags.forEach((t, i) => {
        if (i) cellTags.appendChild(el("br"));
        cellTags.appendChild(el("code", { texte: `${t.taxo}:${t.tag}` }));
        cellTags.appendChild(document.createTextNode(` (${t.points})`));
      });
    } else {
      cellTags.appendChild(el("span", { classe: "souci", texte: "no usable tag" }));
    }
    tr.appendChild(cellTags);
    tr.appendChild(el("td", { texte: rapport.tags.length ? rapport.tags[0].unite : "-" }));
    tr.appendChild(el("td", { texte: String(rapport.points) }));
    tr.appendChild(el("td", { texte: [...rapport.formes].sort().join(", ") || "-" }));
    tr.appendChild(el("td", { texte: String(rapport.derives.length) }));
    table.appendChild(tr);
  }
  bloc.appendChild(table);

  bloc.appendChild(el("div", {
    classe: "aide", style: "margin-top:10px",
    texte: `Mode: ${LIBELLES_MODES[mode]}. "Rebuilt quarters" counts the quarters obtained by `
      + "differencing consecutive cumulative filings — cash-flow statements are filed year-to-date, "
      + "so a discrete quarter is rarely published as such. A ratio shows the tags of its components.",
  }));
  return bloc;
}

// ---------------------------------------------------------------------
// Tableau des formules (repond a « comment c'est calcule ? »)
// ---------------------------------------------------------------------
(function tableauFormules() {
  const table = el("table", { classe: "formules" });
  const entete = el("tr");
  for (const t of ["Metric", "Formula", "Built from (first-choice XBRL tags)"]) {
    entete.appendChild(el("th", { texte: t }));
  }
  table.appendChild(entete);

  const parCat = new Map(CATEGORIES.map((c) => [c, []]));
  for (const [cle, d] of Object.entries(DERIVE)) {
    if (!parCat.has(d.cat)) parCat.set(d.cat, []);
    parCat.get(d.cat).push({ cle, ...d });
  }

  for (const [cat, liste] of parCat) {
    if (!liste.length) continue;
    const g = el("tr", { classe: "groupe" });
    const td = el("td", { texte: cat, colspan: "3" });
    g.appendChild(td);
    table.appendChild(g);

    for (const m of liste.sort((a, b) => a.nom.localeCompare(b.nom, "en"))) {
      const tr = el("tr");
      const c1 = el("td");
      c1.appendChild(el("b", { texte: m.nom }));
      if (m.note) c1.appendChild(el("div", { classe: "aide", texte: m.note }));
      tr.appendChild(c1);
      tr.appendChild(el("td", { classe: "f", texte: m.formule || "-" }));
      tr.appendChild(el("td", {
        classe: "f",
        texte: m.besoins.map((b) => (BASE[b] ? BASE[b].tags[0][1] : b)).join(", "),
      }));
      table.appendChild(tr);
    }
  }
  $("#formules").appendChild(table);
  $("#formules").appendChild(el("div", {
    classe: "aide", style: "margin-top:12px",
    texte: "TTM convention: flow items (revenue, income, cash flow) are summed over the four most "
      + "recent consecutive quarters; balance-sheet items (assets, equity, debt, cash) are taken at "
      + "the latest period end, never summed — a stock does not accumulate. A ratio is therefore "
      + "always TTM flow over point-in-time stock, the standard convention. Alternate tags are tried "
      + "when a company does not use the first-choice one; the audit panel shows which ones were hit.",
  }));
})();

dessinerSelections();
