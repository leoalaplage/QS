// =====================================================================
//  Page "Tableau" : collage des donnees -> dashboard PNG
// =====================================================================

import { chargerTableau } from "./qs-parse.js";
import { analyser } from "./qs-engine.js";
import { dessinerDashboard, dessinerMethodology, csvResultats } from "./qs-dashboard.js";
import * as cfg from "./qs-config.js";
import { ECHELLE_PNG } from "./qs-settings.js";
import {
  $, el, vider, message, blocResultat, bouton, statut, respirer, telechargerTexte,
} from "./qs-ui.js";

const saisie = $("#saisie");
const messages = $("#messages");
const sorties = $("#sorties");
const etatSaisie = $("#etat-saisie");
const act = statut($("#statut"), $("#statut-texte"));

// ---------------------------------------------------------------------
// Chargement des donnees (fichier, glisser-deposer, exemple)
// ---------------------------------------------------------------------
$("#btn-fichier").addEventListener("click", () => $("#fichier").click());

$("#fichier").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  saisie.value = await f.text();
  majEtat(`${f.name} loaded`);
});

for (const evt of ["dragenter", "dragover"]) {
  saisie.addEventListener(evt, (e) => { e.preventDefault(); saisie.classList.add("survol"); });
}
for (const evt of ["dragleave", "drop"]) {
  saisie.addEventListener(evt, () => saisie.classList.remove("survol"));
}
saisie.addEventListener("drop", async (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f) return;
  saisie.value = await f.text();
  majEtat(`${f.name} dropped`);
});

saisie.addEventListener("input", () => majEtat());

function majEtat(prefixe = "") {
  const lignes = saisie.value.trim() ? saisie.value.trim().split(/\r?\n/).length : 0;
  etatSaisie.textContent = lignes
    ? `${prefixe ? prefixe + " - " : ""}${lignes} line${lignes > 1 ? "s" : ""} (headers included)`
    : "";
}

$("#btn-vider").addEventListener("click", () => {
  saisie.value = "";
  vider(messages);
  vider(sorties);
  majEtat();
});

const EXEMPLE = `Ticker,Sector,Market Cap,Return on Invested Capital,ROIC 5Yr Avg,Operating Margin,FCF Margin 5Yr Avg,FCF / Net Income,Gross Margin 5Yr Avg,Shares Out Growth 5Y (CAGR),Stock-based Comp to Revenue,Net Debt / EBITDA,EBIT / Interest Expense,Current Ratio,Long-term Debt to Assets,Capex Coverage,Revenue 5Y CAGR,Revenue Forward 3Y CAGR,Levered Free Cash Flow 5Y CAGR,Net Income 5Y CAGR,EV/EBIT,EV/FCF,Forward P/FCF,FCF Yield
AAPL,Tech Hardware,3480,57.1,50.2,31.8,25.4,108,44.1,-2.6,4.9,0.4,45.0,0.87,0.29,9.1,8.4,7.2,7.9,12.1,29.8,31.5,29.0,3.2
MSFT,Software,3150,22.4,25.8,44.6,30.1,96,68.9,0.2,4.4,0.3,42.0,1.30,0.19,3.4,15.2,13.8,14.9,17.6,30.1,42.0,36.5,2.4
GOOGL,Media,2210,26.5,24.1,32.5,22.6,101,56.8,-1.5,7.1,-0.4,120.0,1.84,0.05,3.1,14.1,11.4,16.2,22.4,20.5,25.7,22.9,3.9
V,Financials,610,29.8,29.0,66.9,52.4,105,97.8,-2.1,3.4,0.1,35.0,1.10,0.24,18.5,11.5,10.2,12.6,14.0,23.4,26.1,24.0,3.8
MSCI,Financials,68,42.0,38.5,54.2,42.8,110,82.0,-1.0,3.0,2.6,9.5,1.05,0.62,25.0,11.8,9.5,13.4,15.5,28.9,33.0,30.2,3.0
FICO,Software,52,55.0,44.0,44.5,32.1,104,79.5,-3.4,5.5,2.1,12.0,1.20,0.55,30.0,9.8,9.0,17.8,19.2,42.0,48.5,41.0,2.1
CPRT,Industrials,48,24.5,26.0,37.8,24.0,88,45.6,0.4,1.2,-1.8,300.0,7.90,0.01,2.0,15.0,10.5,13.0,18.5,26.5,33.4,31.0,2.9
BKNG,Consumer Disc.,165,48.0,35.5,30.2,29.5,118,,-6.2,2.6,0.9,17.0,1.15,0.48,22.0,9.2,8.1,11.5,20.0,17.8,20.5,18.9,5.0`;

$("#btn-exemple").addEventListener("click", () => {
  saisie.value = EXEMPLE;
  majEtat("Example");
});

// ---------------------------------------------------------------------
// Lecture des reglages du formulaire
// ---------------------------------------------------------------------
const nombre = (sel) => {
  const v = $(sel).value.trim();
  return v === "" ? null : Number(v);
};
const liste = (sel) => $(sel).value.split(",").map((s) => s.trim()).filter(Boolean);

function options() {
  const pilierMin = {};
  for (const p of cfg.PILIERS) {
    const v = nombre(`#min-${p}`);
    if (v !== null) pilierMin[p] = v;
  }
  return {
    preset: $("#preset").value || null,
    classerPar: $("#classer").value,
    top: nombre("#top"),
    minScore: nombre("#min-score"),
    maxAlertes: nombre("#max-alertes"),
    capMin: nombre("#cap-min"),
    secteurs: liste("#secteurs"),
    notes: liste("#notes"),
    valoAttractive: $("#valo-attractive").checked,
    sweetSpot: $("#sweet-spot").checked,
    winsoriser: !$("#sans-winsor").checked,
    pilierMin,
  };
}

// ---------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------
$("#btn-generer").addEventListener("click", async () => {
  vider(messages);
  vider(sorties);

  const texte = saisie.value.trim();
  if (!texte) {
    message(messages, "erreur", "Paste your data first (or load a CSV file).");
    return;
  }

  act.montrer("Reading data...");
  await respirer();

  let charge;
  try {
    charge = chargerTableau(texte);
  } catch (e) {
    act.cacher();
    message(messages, "erreur", e.message);
    return;
  }

  const { titres, manquantes, avertissements } = charge;
  const o = options();

  act.montrer(`Scoring ${titres.length} stocks...`);
  await respirer();

  let resultat;
  try {
    resultat = analyser(titres, o);
  } catch (e) {
    act.cacher();
    message(messages, "erreur", `Scoring failed: ${e.message}`);
    return;
  }

  const { retenus, poids, preset } = resultat;
  if (!retenus.length) {
    act.cacher();
    message(messages, "erreur",
      "No stock passes the filters. Loosen the criteria and run again.");
    return;
  }

  act.montrer("Rendering the image...");
  await respirer();

  let dashboard, methodology = null;
  try {
    dashboard = dessinerDashboard(retenus, titres, poids, { preset, echelle: ECHELLE_PNG });
    if ($("#methodo").checked) methodology = dessinerMethodology(poids, { echelle: ECHELLE_PNG });
  } catch (e) {
    act.cacher();
    message(messages, "erreur", `Rendering failed: ${e.message}`);
    return;
  }
  act.cacher();

  // -- messages ---------------------------------------------------------
  const infos = [...avertissements];
  if (manquantes.length) {
    infos.push("Metrics missing from the table (dropped, remaining weights renormalized): " +
      manquantes.map((m) => cfg.NOMS_METRIQUES[m] || m).join(", "));
  }
  if (retenus.length !== titres.length) {
    infos.push(`Filters active: showing ${retenus.length} of ${titres.length} stocks. ` +
      "Percentiles are still computed on the full universe.");
  }
  if (infos.length) message(messages, "info", `${titres.length} stocks analysed.`, infos);
  else message(messages, "ok", `${titres.length} stocks analysed, everything checks out.`);

  // -- resultats --------------------------------------------------------
  const btnCsv = bouton("Download results CSV",
    () => telechargerTexte(csvResultats(retenus), "QS_Screener_resultats.csv"));

  sorties.appendChild(blocResultat(dashboard, {
    titre: "Dashboard",
    nomFichier: "QS_Screener_dashboard.png",
    extras: [btnCsv],
  }));

  if (methodology) {
    sorties.appendChild(blocResultat(methodology, {
      titre: "Methodology",
      nomFichier: "QS_Screener_methodology.png",
    }));
  }

  sorties.scrollIntoView({ behavior: "smooth", block: "start" });
});

// Raccourci : Cmd/Ctrl + Entree depuis la zone de texte
saisie.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") $("#btn-generer").click();
});
