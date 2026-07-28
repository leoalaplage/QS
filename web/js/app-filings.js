// =====================================================================
//  Page "Filings" : chiffres lus dans les depots -> graphes PNG
// =====================================================================

import { SOCIETES } from "./qs-extractions.js";
import { extraire } from "./qs-depots.js";
import { tracer, COULEURS } from "./qs-chart-draw.js";
import { decoderCle, ErreurWorker } from "./qs-chart-edgar.js";
import { lireEtat, ecrireEtat } from "./qs-etat.js";
import { ECHELLE_PNG } from "./qs-settings.js";
import {
  $, el, vider, message, statut, respirer, blocResultat, telechargerTexte,
} from "./qs-ui.js";

const messages = $("#messages");
const sorties = $("#sorties");
const act = statut($("#statut"), $("#statut-texte"));

const sauve = lireEtat("filings", { ticker: "V", profondeur: 12, choisies: null });
let resultat = null;
let choisies = new Set();

// ---------------------------------------------------------------------
// Selection de la societe
// ---------------------------------------------------------------------
const selSociete = $("#societe");
for (const [tk, s] of Object.entries(SOCIETES)) {
  selSociete.appendChild(el("option", { value: tk, texte: `${s.nom} (${tk})` }));
}
selSociete.value = SOCIETES[sauve.ticker] ? sauve.ticker : Object.keys(SOCIETES)[0];
$("#profondeur").value = String(sauve.profondeur || 12);

function societeCourante() { return SOCIETES[selSociete.value]; }

function majNote() {
  const s = societeCourante();
  $("#note-societe").textContent = s.note || "";
  //  Les regles etant ecrites societe par societe, changer de societe
  //  change la liste des series : on repart d'une page propre.
  vider(sorties);
  vider($("#audit"));
  resultat = null;
  dessinerChoix();
}

selSociete.addEventListener("change", majNote);
$("#profondeur").addEventListener("change", enregistrer);

function enregistrer() {
  ecrireEtat("filings", {
    ticker: selSociete.value,
    profondeur: Number($("#profondeur").value) || 12,
    choisies: [...choisies],
  });
}

// ---------------------------------------------------------------------
// Choix des series
// ---------------------------------------------------------------------
function dessinerChoix() {
  const zone = $("#choix-series");
  vider(zone);
  const s = societeCourante();

  //  Groupees comme dans les depots : indicateurs mis en avant, volumes,
  //  composition du chiffre d'affaires. Chacun se trace sur son propre
  //  graphe, les unites n'etant pas comparables.
  const groupes = new Map();
  for (const r of s.series) {
    if (!groupes.has(r.groupe)) groupes.set(r.groupe, []);
    groupes.get(r.groupe).push(r);
  }

  for (const [nomGroupe, regles] of groupes) {
    const bloc = el("div", { classe: "groupe-series" });
    bloc.appendChild(el("div", { classe: "groupe-titre", texte: nomGroupe }));
    const jetons = el("div", { classe: "jetons" });
    for (const r of regles) {
      const actif = choisies.has(r.cle);
      const b = el("button", {
        type: "button",
        classe: `jeton-choix${actif ? " actif" : ""}`,
        texte: r.nom,
        title: r.commentaire || "",
      });
      const n = resultat?.series[r.cle]?.points.length;
      if (n != null) b.appendChild(el("span", { classe: "nm", texte: ` ${n}q` }));
      b.addEventListener("click", () => {
        if (choisies.has(r.cle)) choisies.delete(r.cle); else choisies.add(r.cle);
        dessinerChoix();
        enregistrer();
        if (resultat) dessiner();
      });
      jetons.appendChild(b);
    }
    bloc.appendChild(jetons);
    zone.appendChild(bloc);
  }
}

// ---------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------
function dessiner() {
  vider(sorties);
  if (!resultat) return;
  const s = societeCourante();

  //  Un graphe par GROUPE : melanger un pourcentage de croissance et un
  //  volume en milliards sur un meme axe rend les deux illisibles.
  const parGroupe = new Map();
  for (const r of s.series) {
    if (!choisies.has(r.cle)) continue;
    const serie = resultat.series[r.cle];
    if (!serie || !serie.points.length) continue;
    if (!parGroupe.has(r.groupe)) parGroupe.set(r.groupe, []);
    parGroupe.get(r.groupe).push({ regle: r, serie });
  }

  if (!parGroupe.size) {
    message(messages, "info", "Pick at least one series above to chart it.");
    return;
  }

  let couleur = 0;
  for (const [nomGroupe, liste] of parGroupe) {
    const series = liste.map(({ regle, serie }) => ({
      id: regle.cle,
      libelle: serie.nom,
      points: serie.points.map((p) => ({ ...decoderCle(p.periode), y: p.valeur }))
        .sort((a, b) => a.x - b.x),
      unite: serie.unite,
      devise: "USD",
      couleur: COULEURS[couleur++ % COULEURS.length],
      type: serie.unite === "pct" ? "line" : "bar",
      overlays: {},
    })).filter((x) => x.points.length);

    if (!series.length) continue;
    let rendu;
    try {
      rendu = tracer({
        series,
        titre: `${s.nom} — ${nomGroupe}`,
        sousAxeX: "Period stated in the filing table (calendar quarter of period end)",
        etiquettes: "auto",
      });
    } catch (e) {
      message(messages, "erreur", `${nomGroupe}: ${e.message}`);
      continue;
    }
    //  `tracer` rend { canvas, geo } : la geometrie sert au survol sur la
    //  page Chart, dont on n'a pas besoin ici.
    sorties.appendChild(blocResultat(rendu.canvas, {
      titre: `${s.ticker} — ${nomGroupe}`,
      nomFichier: `qs-${s.ticker}-${nomGroupe.replace(/\W+/g, "-").toLowerCase()}.png`,
    }));
  }

  dessinerAudit();
}

/** Chaque point avec son depot et la ligne brute d'ou il sort. */
function dessinerAudit() {
  const zone = $("#audit");
  vider(zone);
  if (!resultat) return;
  const s = societeCourante();
  for (const r of s.series) {
    if (!choisies.has(r.cle)) continue;
    const serie = resultat.series[r.cle];
    if (!serie || !serie.points.length) continue;
    const bloc = el("div", { classe: "detail-societe" });
    bloc.appendChild(el("h3", { texte: serie.nom }));
    const table = el("table", { classe: "tbl-fcf" });
    const tr = el("tr");
    for (const t of ["Period", "Value", "Filing", "Table row as read"]) tr.appendChild(el("th", { texte: t }));
    table.appendChild(tr);
    for (const p of [...serie.points].reverse()) {
      const l = el("tr");
      l.appendChild(el("td", { classe: "fenetre", texte: p.periode }));
      l.appendChild(el("td", { texte: format(p.valeur, serie.unite) }));
      l.appendChild(el("td", { classe: "menu", texte: p.source }));
      l.appendChild(el("td", { classe: "menu", texte: p.extrait }));
      table.appendChild(l);
    }
    const env = el("div", { classe: "table-scroll" });
    env.appendChild(table);
    bloc.appendChild(env);
    zone.appendChild(bloc);
  }
}

function format(v, unite) {
  if (v == null || !isFinite(v)) return "—";
  if (unite === "pct") return `${v} %`;
  const a = Math.abs(v), signe = v < 0 ? "−" : "";
  if (a >= 1e9) return `${signe}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${signe}$${(a / 1e6).toFixed(0)}M`;
  return `${signe}${v}`;
}

// ---------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------
async function lancer() {
  vider(messages);
  const s = societeCourante();
  const trimestres = Number($("#profondeur").value) || 12;

  act.montrer(`Reading ${s.ticker} filings…`);
  await respirer();
  resultat = await extraire(s, { trimestres, surAvancement: (t) => act.montrer(t) });
  act.cacher();

  const trouvees = Object.values(resultat.series).filter((x) => x.points.length);
  if (!trouvees.length) {
    message(messages, "erreur",
      `Nothing could be read from ${s.ticker}'s filings. The report layout may have changed — `
      + "the extraction rules are written per company and per table.");
    return;
  }

  //  Premiere visite : on montre les indicateurs mis en avant, ceux que la
  //  societe elle-meme place en tete de son communique.
  if (!choisies.size) {
    const defaut = s.series.filter((r) => r.groupe === s.series[0].groupe).map((r) => r.cle);
    choisies = new Set(defaut.filter((c) => resultat.series[c]?.points.length));
  }

  dessinerChoix();
  dessiner();
  enregistrer();

  const total = trouvees.reduce((a, x) => a + x.points.length, 0);
  message(messages, "ok",
    `${trouvees.length} series, ${total} quarterly figures read from `
    + `${Object.entries(resultat.depots).map(([k, v]) => `${v} ${k}`).join(" and ")}.`
    + (resultat.manques.length ? ` ${resultat.manques.length} lookups found nothing — see the audit panel.` : ""));
}

$("#btn-extraire").addEventListener("click", () => {
  lancer().catch((e) => {
    act.cacher();
    message(messages, "erreur", e instanceof ErreurWorker ? e.message : `Unexpected error: ${e.message}`);
  });
});

$("#btn-csv").addEventListener("click", () => {
  if (!resultat) { message(messages, "erreur", "Read the filings first."); return; }
  const s = societeCourante();
  const periodes = [...new Set(Object.values(resultat.series)
    .flatMap((x) => x.points.map((p) => p.periode)))].sort();
  const cles = s.series.filter((r) => resultat.series[r.cle]?.points.length);
  const lignes = [["Period", ...cles.map((r) => r.nom)]];
  for (const per of periodes) {
    lignes.push([per, ...cles.map((r) => {
      const p = resultat.series[r.cle].points.find((x) => x.periode === per);
      return p ? p.valeur : "";
    })]);
  }
  telechargerTexte(
    lignes.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"),
    `qs-${s.ticker}-filings.csv`);
});

if (Array.isArray(sauve.choisies)) choisies = new Set(sauve.choisies);
majNote();
