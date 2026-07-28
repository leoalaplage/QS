// =====================================================================
//  QS - Ingestion : pre-calculer tout le S&P 500, une fois par nuit
//
//  POURQUOI CE SCRIPT EXISTE
//  Jusqu'ici chaque page retelechargeait EDGAR et rejouait les formules a
//  chaque visite. Analyser vingt-sept titres prenait vingt secondes ;
//  cribler cinq cents sociétés etait hors d'atteinte. Le calcul est
//  pourtant IDENTIQUE d'une visite a l'autre : les comptes d'Apple ne
//  changent pas entre deux chargements de page.
//
//  On le fait donc UNE FOIS, ici, et le site ne lit plus que le resultat.
//
//  POURQUOI DES FICHIERS ET PAS UNE BASE
//  Le site est statique et servi par GitHub Pages. Un fichier JSON y est
//  distribue par le meme cache que le reste, sans serveur a maintenir,
//  sans base a sauvegarder, et l'historique git montre exactement ce qui
//  a change d'une nuit a l'autre. Cinq cents societes tiennent largement
//  dans ce format. Le jour ou l'univers s'elargit, le contrat de donnees
//  ne bouge pas : seule sa source devient une vraie base.
//
//  POURQUOI IL REUTILISE LE CODE DU SITE
//  Les modules de metriques sont du JavaScript sans dependance au
//  navigateur : ce script les importe TELS QUELS. Il n'existe donc aucune
//  seconde implementation des formules qui pourrait diverger de celle
//  qu'affiche le site -- c'est la meme, executee ailleurs.
// =====================================================================

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BASE, DERIVE } from "../web/js/qs-chart-metrics.js";
import { construireSerie, MODES } from "../web/js/qs-chart-edgar.js";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, "..");
const SORTIE = path.join(RACINE, "web", "data", "univers");

//  La SEC exige un agent nominatif et tolere dix requetes par seconde.
//  On reste tres en dessous : rien ne presse, ce script tourne la nuit.
const AGENT = process.env.SEC_AGENT || "QS ingest leoalaplage@gmail.com";
const ENTRE_APPELS = 130;          // ms
const ESSAIS = 3;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * N'ecrit que si le contenu a CHANGE.
 *
 * Les comptes d'une societe ne bougent qu'a la publication d'un rapport,
 * soit quatre fois l'an. Reecrire les cinq cents fichiers chaque nuit
 * produirait cinq cents fichiers modifies pour rien, et l'historique du
 * depot n'aurait plus aucune valeur -- alors que tel quel, il montre
 * exactement quelle societe a publie quoi, et quand.
 */
async function ecrireSiChange(chemin, contenu) {
  try {
    if (await readFile(chemin, "utf8") === contenu) return false;
  } catch { /* le fichier n'existe pas encore */ }
  await writeFile(chemin, contenu);
  return true;
}

async function facts(cik) {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`;
  for (let essai = 1; essai <= ESSAIS; essai++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": AGENT, Accept: "application/json" } });
      if (r.status === 404) return null;                    // societe sans depot XBRL
      if (r.status === 429) { await dormir(2000 * essai); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (essai === ESSAIS) throw e;
      await dormir(1000 * essai);
    }
  }
  return null;
}

/** Rapport de tracabilite vierge, comme en attend le moteur de series. */
const rapport = () => ({
  tags: [], devises: new Set(), formes: new Set(),
  derives: [], incoherences: [], anomaliesAnnuelles: [], points: 0,
});

//  Ce qu'on garde par societe. Le trimestriel et le TTM sont pre-calcules
//  au meme titre que l'annuel : les reconstituer dans le navigateur
//  couterait le meme travail a chaque visite.
const MAILLES = [["annuel", MODES.ANNUEL], ["trimestre", MODES.TRIMESTRE], ["ttm", MODES.TTM]];

//  Metriques mises en avant dans l'index, celles sur lesquelles on crible.
//  Le detail complet reste dans la fiche de chaque societe.
const VEDETTES = [
  "revenue", "net_income", "fcf", "gross_margin", "operating_margin",
  "net_margin", "fcf_margin", "roic", "roe", "assets", "equity",
  "shares_diluted", "eps_publie", "dividends", "buybacks",
];

const derniere = (serie) => {
  const k = Object.keys(serie || {}).sort();
  return k.length ? { periode: k[k.length - 1], valeur: serie[k[k.length - 1]] } : null;
};

/** Croissance annuelle composee sur `n` exercices d'une serie annuelle. */
function cagr(serie, n) {
  const annees = Object.keys(serie || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (annees.length < n + 1) return null;
  const fin = serie[annees[annees.length - 1]];
  const debut = serie[annees[annees.length - 1 - n]];
  if (!(debut > 0) || !(fin > 0)) return null;
  return ((fin / debut) ** (1 / n) - 1) * 100;
}

async function traiter(societe) {
  const f = await facts(societe.cik);
  if (!f) return { erreur: "no XBRL filings" };

  const taxonomies = Object.keys(f.facts || {});
  if (!taxonomies.includes("us-gaap") && !taxonomies.includes("ifrs-full")) {
    return { erreur: `files nothing usable (${taxonomies.join(", ") || "empty"})` };
  }

  const cles = [...Object.keys(BASE), ...Object.keys(DERIVE)];
  const fiche = { ticker: societe.ticker, cik: societe.cik, nom: societe.nom,
    secteur: societe.secteur, industrie: societe.industrie,
    entite: f.entityName || societe.nom, series: {} };
  const devises = new Set();
  const alertes = [];

  for (const [nomMaille, mode] of MAILLES) {
    const cache = {};
    for (const cle of cles) {
      const r = rapport();
      let serie;
      try {
        serie = construireSerie(f, cle, mode, cache, r);
      } catch (e) {
        alertes.push(`${cle} [${nomMaille}]: ${e.message}`);
        continue;
      }
      const points = Object.entries(serie).filter(([, v]) => v != null && isFinite(v));
      if (!points.length) continue;
      //  Les valeurs sont arrondies : un chiffre d'affaires au centime pres
      //  n'apporte rien et triple le poids du fichier.
      const propre = {};
      for (const [k, v] of points) propre[k] = Math.abs(v) >= 1000 ? Math.round(v) : Number(v.toFixed(4));
      (fiche.series[nomMaille] ||= {})[cle] = propre;
      for (const d of r.devises) devises.add(d);
      for (const i of r.incoherences) alertes.push(`${cle} [${nomMaille}]: ${i}`);
    }
  }

  fiche.devise = [...devises][0] || "USD";
  //  Les incoherences sont conservees : c'est ce qui permet a une page
  //  d'expliquer un chiffre surprenant sans relire les depots.
  fiche.alertes = [...new Set(alertes)].slice(0, 40);

  const annuel = fiche.series.annuel || {};
  const resume = { ticker: societe.ticker, nom: societe.nom, secteur: societe.secteur,
    industrie: societe.industrie, devise: fiche.devise };
  for (const cle of VEDETTES) {
    const d = derniere(annuel[cle]);
    if (d) { resume[cle] = d.valeur; resume[`${cle}__periode`] = d.periode; }
  }
  resume.revenue_cagr5 = cagr(annuel.revenue, 5);
  resume.revenue_cagr10 = cagr(annuel.revenue, 10);
  resume.fcf_cagr5 = cagr(annuel.fcf, 5);
  resume.exercices = Object.keys(annuel.revenue || {}).length;

  return { fiche, resume };
}

// ---------------------------------------------------------------------
async function principal() {
  const liste = JSON.parse(await readFile(path.join(RACINE, "web", "data", "sp500.json"), "utf8"));
  const seulement = process.argv.slice(2).filter((a) => !a.startsWith("-")).map((a) => a.toUpperCase());
  const cibles = seulement.length ? liste.filter((s) => seulement.includes(s.ticker)) : liste;

  if (!existsSync(SORTIE)) await mkdir(SORTIE, { recursive: true });

  const index = [];
  const echecs = [];
  let fait = 0, modifies = 0;

  for (const societe of cibles) {
    fait++;
    //  Une scission enregistree mais qui n'a pas encore depose de comptes
    //  n'est pas un echec : il n'y a rien a lire, et ce sera vrai jusqu'a
    //  son premier rapport annuel.
    if (societe.sansComptes) { echecs.push(`${societe.ticker}: ${societe.sansComptes}`); continue; }
    try {
      const r = await traiter(societe);
      if (r.erreur) {
        echecs.push(`${societe.ticker}: ${r.erreur}`);
      } else {
        if (await ecrireSiChange(path.join(SORTIE, `${societe.ticker}.json`), JSON.stringify(r.fiche))) {
          modifies++;
        }
        index.push(r.resume);
      }
    } catch (e) {
      echecs.push(`${societe.ticker}: ${e.message}`);
    }
    if (fait % 25 === 0 || fait === cibles.length) {
      process.stderr.write(`  ${fait}/${cibles.length} — ${index.length} ok, ${echecs.length} en echec\n`);
    }
    await dormir(ENTRE_APPELS);
  }

  //  L'index n'est reecrit que sur une passe complete : une passe ciblee,
  //  lancee pour deboguer une societe, ne doit pas amputer le screener.
  if (!seulement.length) {
    index.sort((a, b) => a.ticker.localeCompare(b.ticker));
    await ecrireSiChange(path.join(SORTIE, "index.json"), JSON.stringify({
      genere: new Date().toISOString(),
      univers: "S&P 500",
      societes: index.length,
      echecs,
      lignes: index,
    }));
  }

  process.stderr.write(`\n${index.length} societes lues, ${modifies} fichiers modifies, ${echecs.length} en echec\n`);
  if (echecs.length) process.stderr.write(echecs.slice(0, 20).join("\n") + "\n");
}

principal().catch((e) => { console.error(e); process.exit(1); });
