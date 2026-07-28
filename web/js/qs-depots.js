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
function moissonner(bloc, type, out, nb) {
  for (let i = 0; i < (bloc.form || []).length && out.length < nb; i++) {
    if (bloc.form[i] !== type) continue;
    if (type === "8-K" && !String(bloc.items?.[i] || "").includes("2.02")) continue;
    out.push({
      forme: type,
      accession: bloc.accessionNumber[i].replace(/-/g, ""),
      date: bloc.filingDate[i],
      periodeDepot: bloc.reportDate?.[i] || null,
      principal: bloc.primaryDocument[i],
    });
  }
}

export async function derniersDepots(cik, type, nb) {
  const d = await relais(`/submissions/${cik}`);
  const out = [];
  moissonner(d.filings?.recent || {}, type, out, nb);

  //  `filings.recent` s'arrete a mille depots -- une bonne dizaine
  //  d'annees chez une societe active, pas davantage. Au-dela, la SEC
  //  range l'historique dans des fichiers d'archive, qu'on n'ouvre que
  //  si la profondeur demandee l'exige.
  const archives = [...(d.filings?.files || [])]
    .sort((a, b) => String(b.filingTo).localeCompare(String(a.filingTo)));
  for (const fichier of archives) {
    if (out.length >= nb) break;
    try {
      moissonner(await relais(`/submissions-archive/${fichier.name}`), type, out, nb);
    } catch { /* une archive illisible n'arrete pas le reste */ }
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
    const tout = [...vus.values()].sort((a, b) => a.periode.localeCompare(b.periode));
    s.points = tout.filter((p) => !p.periode.startsWith("A"));
    s.annuels = tout.filter((p) => p.periode.startsWith("A"));
    completerParDifference(s);
  }

  return {
    series, manques,
    depots: Object.fromEntries(Object.entries(parSource).map(([k, v]) => [k, v.length])),
  };
}

export { decoderEntites };


/**
 * Reconstitue le trimestre que la societe ne publie jamais seul.
 *
 * Visa ne depose que trois rapports trimestriels par exercice : les
 * volumes des trois mois clos en juin n'existent que fondus dans le
 * rapport annuel, qui les donne sur douze mois. Sans eux, aucune serie de
 * volume n'a quatre trimestres consecutifs, et le cumul sur douze mois
 * glissants devient impossible -- c'est tout l'interet de la maille TTM
 * qui tombait.
 *
 * La difference est exacte, pas une estimation : douze mois moins les
 * trois trimestres connus donne le quatrieme. On ne la calcule QUE si les
 * trois autres sont la ; deux suffisantes ne suffisent pas.
 */
function completerParDifference(serie) {
  if (!serie.annuels?.length) return;
  const idx = (c) => {
    const m = /^A?(\d{4})Q([1-4])$/.exec(c);
    return m ? Number(m[1]) * 4 + (Number(m[2]) - 1) : null;
  };
  const cle = (i) => `${Math.floor(i / 4)}Q${(i % 4) + 1}`;
  const connus = new Map(serie.points.map((p) => [idx(p.periode), p]));

  for (const an of serie.annuels) {
    const fin = idx(an.periode);
    if (fin == null) continue;
    const fenetre = [fin, fin - 1, fin - 2, fin - 3];
    const manquants = fenetre.filter((i) => !connus.has(i));
    if (manquants.length !== 1) continue;
    const somme = fenetre.filter((i) => connus.has(i))
      .reduce((a, i) => a + connus.get(i).valeur, 0);
    const v = an.valeur - somme;
    if (!isFinite(v)) continue;
    const p = {
      periode: cle(manquants[0]), valeur: v, source: `${an.source} (by difference)`,
      extrait: `twelve months ${an.periode.slice(1)} minus the three reported quarters`,
      reconstruit: true,
    };
    connus.set(manquants[0], p);
    serie.points.push(p);
  }
  serie.points.sort((a, b) => a.periode.localeCompare(b.periode));
}

// ---------------------------------------------------------------------
// Agregation temporelle
// ---------------------------------------------------------------------
const idxDe = (cle) => {
  const m = /^(\d{4})Q([1-4])$/.exec(cle);
  return m ? Number(m[1]) * 4 + (Number(m[2]) - 1) : null;
};
const cleDe = (i) => `${Math.floor(i / 4)}Q${(i % 4) + 1}`;

/**
 * Ramene une serie trimestrielle a la maille demandee.
 *
 * Un VOLUME se cumule : douze mois glissants, c'est la somme de quatre
 * trimestres. Un TAUX DE CROISSANCE, non : additionner quatre variations
 * annuelles ne veut rien dire. On en prend la moyenne, ce qui donne bien
 * « la croissance moyenne des douze derniers mois », et c'est dit dans
 * l'interface -- une moyenne de taux n'est pas un taux sur douze mois, et
 * il ne faut pas laisser croire le contraire.
 *
 * Quatre trimestres CONSECUTIFS sont exiges. Un trou -- et il y en a un
 * par exercice, le quatrieme trimestre fiscal etant couvert par le 10-K
 * dont les tableaux sont annuels -- ne se comble pas par une somme de
 * trois.
 *
 * @param {"trimestre"|"ttm"|"annuel"} maille
 */
export function agreger(points, maille, unite) {
  if (maille === "trimestre" || !points.length) return points;

  const parIdx = new Map();
  for (const p of points) {
    const i = idxDe(p.periode);
    if (i != null) parIdx.set(i, p);
  }
  const moyenne = unite === "pct";
  const sortie = [];

  if (maille === "ttm") {
    for (const [i, p] of [...parIdx.entries()].sort((a, b) => a[0] - b[0])) {
      const fenetre = [p, parIdx.get(i - 1), parIdx.get(i - 2), parIdx.get(i - 3)];
      if (fenetre.some((x) => x === undefined)) continue;
      const somme = fenetre.reduce((a, x) => a + x.valeur, 0);
      sortie.push({
        ...p, periode: cleDe(i),
        valeur: moyenne ? somme / 4 : somme,
        source: `${fenetre[3].periode}→${p.periode}`,
        extrait: `${maille.toUpperCase()} of ${fenetre.map((x) => x.periode).reverse().join(", ")}`,
      });
    }
    return sortie;
  }

  //  Annuel : les quatre trimestres CIVILS d'une meme annee.
  const parAnnee = new Map();
  for (const [i, p] of parIdx) {
    const an = Math.floor(i / 4);
    if (!parAnnee.has(an)) parAnnee.set(an, []);
    parAnnee.get(an).push(p);
  }
  for (const [an, liste] of [...parAnnee.entries()].sort((a, b) => a[0] - b[0])) {
    if (liste.length !== 4) continue;
    const somme = liste.reduce((a, x) => a + x.valeur, 0);
    sortie.push({
      periode: `${an}Q4`,
      valeur: moyenne ? somme / 4 : somme,
      source: `${an} (4 quarters)`,
      extrait: `Calendar ${an}: ${liste.map((x) => x.periode).join(", ")}`,
    });
  }
  return sortie;
}
