// =====================================================================
//  QS - Recuperation des depots et application des regles d'extraction
// =====================================================================

import { workerUrl } from "./qs-settings.js";
import {
  analyserTableaux, valeurs, libelleDe, periodeDuTableau, decoderEntites,
} from "./qs-tableaux.js";

async function relais(chemin, json = true) {
  const base = workerUrl();
  if (!base) throw new Error("No EDGAR relay configured.");
  const r = await fetch(`${base}${chemin}`);
  if (!r.ok) throw new Error(`Relay answered ${r.status}`);
  return json ? r.json() : r.text();
}

/**
 * Les `nb` derniers depots d'un type donne.
 * Le 8-K n'est retenu que s'il porte l'item 2.02 -- les resultats.
 */
export async function derniersDepots(cik, type, nb) {
  const d = await relais(`/submissions/${cik}`);
  const r = d.filings?.recent || {};
  const out = [];
  for (let i = 0; i < (r.form || []).length && out.length < nb; i++) {
    if (r.form[i] !== type) continue;
    if (type === "8-K" && !String(r.items?.[i] || "").includes("2.02")) continue;
    out.push({
      forme: type,
      accession: r.accessionNumber[i].replace(/-/g, ""),
      date: r.filingDate[i],
      periodeDepot: r.reportDate?.[i] || null,
      principal: r.primaryDocument[i],
    });
  }
  return out;
}

/**
 * Le document a lire dans un depot.
 *
 * Pour un 10-Q c'est le document principal. Pour un 8-K c'est la piece
 * jointe, dont le nom est libre -- « q22026earningsrelease.htm » chez
 * Visa : on retient le plus gros fichier HTML qui ne soit ni la coquille
 * du 8-K ni un fichier de rendu.
 */
async function documentDe(cik, depot) {
  if (depot.forme !== "8-K") return `/archive/${cik}/${depot.accession}/${depot.principal}`;
  const idx = await relais(`/archive/${cik}/${depot.accession}/index.json`);
  const items = (idx.directory?.item || []).filter((it) => it.name.endsWith(".htm")
    && it.name !== depot.principal && !/^R\d+\.htm$/.test(it.name));
  if (!items.length) return null;
  items.sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
  return `/archive/${cik}/${depot.accession}/${items[0].name}`;
}

/**
 * Applique une regle a un document deja decoupe en tableaux.
 *
 * On retient le PREMIER tableau qui satisfait le motif ET contient la
 * ligne cherchee. Exiger les deux evite de tomber sur un tableau
 * homonyme -- le communique de Visa contient deux fois « Key business
 * drivers », un resume et un detail -- et de repartir avec la mauvaise
 * colonne.
 *
 * @returns {{valeur, periode, tableau, brut}|null}
 */
export function appliquer(regle, tableaux) {
  //  Une valeur sans periode datable ne clot pas la recherche.
  //
  //  Le communique de Visa presente ses indicateurs deux fois : un resume
  //  en tete, date « Q2 2026 » -- un trimestre FISCAL, qu'on ne sait pas
  //  convertir sans connaitre la cloture -- puis un tableau detaille date
  //  « Three Months Ended March 31, 2026 ». En s'arretant au premier, on
  //  repartait avec un chiffre juste mais impossible a placer, et la
  //  serie restait vide. On garde donc la premiere trouvaille en reserve
  //  et on continue de chercher un tableau qui, lui, se date.
  let repli = null;
  for (const t of tableaux) {
    if (!regle.tableau.test(t.texte)) continue;
    for (const cellules of t.lignes) {
      const lib = libelleDe(cellules);
      if (!lib || !regle.ligne.test(lib)) continue;
      const nombres = valeurs(cellules);
      //  La position se DEDUIT du nombre de colonnes, elle ne se code pas
      //  en dur. Les 10-Q de Visa d'avant 2026 intercalaient une colonne
      //  « % Change » par region : le total Visa passait du 5e au 7e
      //  nombre, et un rang fige ramenait un chiffre americain la ou on
      //  attendait un total mondial. En raisonnant par GROUPE -- trois
      //  regions ici, quel que soit le nombre de colonnes de chacune --
      //  la lecture reste juste des deux cotes du changement.
      const groupes = regle.groupes || 1;
      const parGroupe = Math.floor(nombres.length / groupes);
      if (parGroupe < 1) continue;
      const rang = regle.groupes
        ? (regle.groupe0 ?? 0) * parGroupe + (regle.dansGroupe ?? 0)
        : (regle.colonne ?? 0);
      const v = nombres[rang];
      if (v == null || !isFinite(v)) continue;
      const trouvaille = {
        valeur: regle.echelle ? v * regle.echelle : v,
        brut: v,
        periode: periodeDuTableau(t.texte),
        tableau: t.index,
        ligne: cellules.join(" | ").slice(0, 200),
      };
      if (trouvaille.periode) return trouvaille;
      if (!repli) repli = trouvaille;
      break;                       // ce tableau est epuise, au suivant
    }
  }
  return repli;
}

/**
 * Extrait toutes les series d'une societe sur ses derniers depots.
 *
 * @returns {{series, depots, manques}}
 *   series : {cle: {nom, unite, groupe, points:[{periode, valeur, source}]}}
 */
export async function extraire(societe, { trimestres = 12, surAvancement = () => {} } = {}) {
  const parSource = {};
  for (const forme of [...new Set(societe.series.map((s) => s.source))]) {
    parSource[forme] = await derniersDepots(societe.cik, forme, trimestres);
  }

  const series = {};
  for (const r of societe.series) {
    series[r.cle] = { nom: r.nom, unite: r.unite, groupe: r.groupe, commentaire: r.commentaire, points: [] };
  }
  const manques = [];
  let lus = 0;
  const totalDocs = Object.values(parSource).reduce((a, d) => a + d.length, 0);

  for (const [forme, depots] of Object.entries(parSource)) {
    const regles = societe.series.filter((s) => s.source === forme);
    for (const depot of depots) {
      lus++;
      surAvancement(`${societe.ticker}: reading ${forme} of ${depot.date}… ${lus}/${totalDocs}`);
      let tableaux;
      try {
        const chemin = await documentDe(societe.cik, depot);
        if (!chemin) { manques.push(`${forme} ${depot.date}: no document`); continue; }
        tableaux = analyserTableaux(await relais(chemin, false));
      } catch (e) {
        manques.push(`${forme} ${depot.date}: ${e.message}`);
        continue;
      }

      for (const r of regles) {
        const t = appliquer(r, tableaux);
        if (!t) continue;
        //  Sans periode lisible dans le tableau, le point est ecarte : le
        //  placer d'apres la date de depot le decalerait d'un trimestre
        //  chez Visa, dont les volumes sont publies en retard.
        if (!t.periode) { manques.push(`${r.cle} ${depot.date}: no period in the table`); continue; }
        series[r.cle].points.push({
          periode: t.periode, valeur: t.valeur, source: `${forme} ${depot.date}`,
          extrait: t.ligne, accession: depot.accession,
        });
      }
    }
  }

  //  Un meme trimestre peut etre publie deux fois -- une fois dans le
  //  rapport du trimestre, une fois en comparatif l'annee suivante. On
  //  garde la premiere lecture, issue du depot le plus recent.
  for (const s of Object.values(series)) {
    const vus = new Map();
    for (const p of s.points) if (!vus.has(p.periode)) vus.set(p.periode, p);
    s.points = [...vus.values()].sort((a, b) => a.periode.localeCompare(b.periode));
  }

  return {
    series, manques,
    depots: Object.fromEntries(Object.entries(parSource).map(([k, v]) => [k, v.length])),
  };
}

export { decoderEntites };
