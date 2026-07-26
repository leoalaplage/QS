// =====================================================================
//  QS Screener - Moteur de notation
//  Port fidele du coeur de qs_screener.py : percentiles, melange
//  relatif/absolu, piliers, TOTAL, note-lettre, alertes, classements.
// =====================================================================

import * as cfg from "./qs-config.js";
import { norm } from "./qs-parse.js";

const PILIERS = cfg.PILIERS;

// ---------------------------------------------------------------------
// Utilitaires statistiques
// ---------------------------------------------------------------------
function percentileDe(valeursTriees, p) {
  const n = valeursTriees.length;
  if (n === 0) return null;
  if (n === 1) return valeursTriees[0];
  const rang = (p / 100.0) * (n - 1);
  const bas = Math.floor(rang);
  const frac = rang - bas;
  if (bas + 1 < n) return valeursTriees[bas] + frac * (valeursTriees[bas + 1] - valeursTriees[bas]);
  return valeursTriees[bas];
}

function mediane(valeurs) {
  const v = valeurs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return null;
  const m = Math.floor(n / 2);
  return n % 2 ? v[m] : (v[m - 1] + v[m]) / 2.0;
}

/** Classement de competition : les ex aequo partagent le meme rang. */
function rangCompetition(indicesOrdonnes, valeurDe) {
  const rangs = {};
  let rang = 0, precedent = null;
  indicesOrdonnes.forEach((i, pos) => {
    const v = Math.round(valeurDe(i) * 1e4) / 1e4;
    if (v !== precedent) { rang = pos + 1; precedent = v; }
    rangs[i] = rang;
  });
  return rangs;
}

// ---------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------
/** Score absolu 0-100 d'une valeur brute, d'apres les ancres de config. */
function scoreAbsolu(cle, valeur) {
  if (valeur === null) return null;
  const ancre = cfg.ANCRES_ABSOLUES[cle];
  if (!ancre) return null;
  if (cfg.NEGATIF_PIRE.has(cle) && valeur <= 0) return 0.0;   // multiple negatif = absurde
  const [v0, v100] = ancre;
  if (v100 === v0) return 50.0;
  const score = ((valeur - v0) / (v100 - v0)) * 100.0;
  return Math.max(0.0, Math.min(100.0, score));
}

/** null si absent ; multiple de valo <= 0 exclu du classement. */
function valeurUtilisable(cle, v) {
  if (v === null || v === undefined) return null;
  if (cfg.NEGATIF_PIRE.has(cle) && v <= 0) return null;
  return v;
}

/**
 * Percentiles par metrique DANS `groupe` -> t[cleCible][metrique].
 * Les valeurs manquantes ne recoivent PAS 50 : la cle reste absente et sera
 * geree par renormalisation au niveau du pilier.
 */
function percentilesGroupe(groupe, cleCible, winsoriser) {
  for (const t of groupe) t[cleCible] = {};

  for (const m of cfg.METRIQUES) {
    const { cle, sens } = m;
    const presents = [];
    for (const t of groupe) {
      const v = valeurUtilisable(cle, t.brut[cle]);
      if (v !== null) presents.push(t);
    }
    let valeurs = presents.map((t) => valeurUtilisable(cle, t.brut[cle]));

    // plafond economique : au-dela, "plus haut" n'est plus "meilleur"
    const plafond = cfg.PLAFONDS[cle];
    if (plafond !== undefined) valeurs = valeurs.map((v) => Math.min(v, plafond));

    if (winsoriser && cfg.WINSOR_BAS !== null && valeurs.length >= 3) {
      const tri = [...valeurs].sort((a, b) => a - b);
      const lo = percentileDe(tri, cfg.WINSOR_BAS);
      const hi = percentileDe(tri, cfg.WINSOR_HAUT);
      valeurs = valeurs.map((v) => Math.min(Math.max(v, lo), hi));
    }

    const n = valeurs.length;
    if (n === 1) {
      presents[0][cleCible][cle] = 50.0;
    } else if (n > 1) {
      presents.forEach((t, i) => {
        const v = valeurs[i];
        const c = sens === "H"
          ? valeurs.reduce((acc, x) => acc + (x < v ? 1 : 0), 0)
          : valeurs.reduce((acc, x) => acc + (x > v ? 1 : 0), 0);
        t[cleCible][cle] = (c / (n - 1)) * 100.0;
      });
    }
  }
}

/**
 * score par metrique = MELANGE_RELATIF * percentile + MELANGE_ABSOLU * ancres.
 * null = donnee absente (renormalisee). Multiple de valo <= 0 = pire (0).
 */
function melangeScores(t) {
  t.score_metrique = {};
  const src = (cfg.PERCENTILE_SECTORIEL && t.pct_sect) ? t.pct_sect : t.pct;
  for (const m of cfg.METRIQUES) {
    const cle = m.cle;
    const brut = t.brut[cle];
    if (brut === null || brut === undefined) { t.score_metrique[cle] = null; continue; }
    if (cfg.NEGATIF_PIRE.has(cle) && brut <= 0) { t.score_metrique[cle] = 0.0; continue; }
    const rel = src[cle];
    if (rel === undefined || rel === null) { t.score_metrique[cle] = null; continue; }
    const absv = scoreAbsolu(cle, brut);
    t.score_metrique[cle] = absv === null
      ? rel
      : cfg.MELANGE_RELATIF * rel + cfg.MELANGE_ABSOLU * absv;
  }
}

/**
 * Piliers + TOTAL + couverture. Chaque pilier = moyenne ponderee des
 * metriques DISPONIBLES (poids renormalises).
 */
function calculPiliers(t, clePct, poidsPiliers) {
  const metrParPilier = {};
  for (const m of cfg.METRIQUES) (metrParPilier[m.pilier] ||= []).push(m);

  const piliers = {};
  let poidsDispo = 0.0, poidsTot = 0.0;
  for (const [pilier, metrs] of Object.entries(metrParPilier)) {
    let num = 0.0, den = 0.0;
    for (const mm of metrs) {
      const w = mm.poids;
      poidsTot += w * poidsPiliers[pilier];
      const s = t[clePct][mm.cle];
      if (s !== null && s !== undefined) {
        num += s * w;
        den += w;
        poidsDispo += w * poidsPiliers[pilier];
      }
    }
    piliers[pilier] = den > 0 ? num / den : null;
  }

  const pilOk = Object.entries(piliers).filter(([, v]) => v !== null);
  const sp = pilOk.reduce((a, [p]) => a + poidsPiliers[p], 0);
  const total = sp ? pilOk.reduce((a, [p, v]) => a + v * poidsPiliers[p], 0) / sp : null;
  const couverture = poidsTot ? poidsDispo / poidsTot : 0.0;
  return { piliers, total, couverture };
}

function noteDe(total) {
  for (const [lettre, seuil] of cfg.GRILLE_NOTES) if (total >= seuil) return lettre;
  return cfg.GRILLE_NOTES[cfg.GRILLE_NOTES.length - 1][0];
}

function valuationDe(scoreValue) {
  for (let i = 0; i < cfg.NIVEAUX_VALUATION.length; i++) {
    const [libelle, seuil] = cfg.NIVEAUX_VALUATION[i];
    if (scoreValue >= seuil) return [libelle, i];
  }
  const last = cfg.NIVEAUX_VALUATION.length - 1;
  return [cfg.NIVEAUX_VALUATION[last][0], last];
}

function forcesFaiblesses(t) {
  const paires = Object.entries(t.score_metrique)
    .filter(([, p]) => p !== null && p !== undefined)
    .map(([c, p]) => [cfg.NOMS_METRIQUES[c] || c, p]);
  const forces = paires.filter(([, p]) => p >= cfg.SEUIL_FORCE)
    .sort((a, b) => b[1] - a[1]).slice(0, cfg.NB_FORCES);
  const faibles = paires.filter(([, p]) => p <= cfg.SEUIL_FAIBLESSE)
    .sort((a, b) => a[1] - b[1]).slice(0, cfg.NB_FORCES);
  return [forces, faibles];
}

const OPS = {
  ">": (a, b) => a > b, ">=": (a, b) => a >= b,
  "<": (a, b) => a < b, "<=": (a, b) => a <= b,
  "==": (a, b) => a === b, "!=": (a, b) => a !== b,
};

function alertesDe(t) {
  const details = [];
  for (const [libelle, cle, op, seuil] of cfg.REGLES_ALERTES) {
    const v = t.brut[cle];
    if (v !== null && v !== undefined && OPS[op](v, seuil)) details.push(libelle);
  }
  return details;
}

// ---------------------------------------------------------------------
// Pipeline complet
// ---------------------------------------------------------------------
export function calculerScores(titres, poidsPiliers, winsoriser = true) {
  const n = titres.length;

  // 1) percentiles : univers complet, puis intra-secteur si assez de pairs
  percentilesGroupe(titres, "pct", winsoriser);
  const secteurs = {};
  for (const t of titres) (secteurs[t.Secteur] ||= []).push(t);
  for (const groupe of Object.values(secteurs)) {
    const taille = groupe.length;
    for (const t of groupe) t.taille_secteur = taille;
    if (taille >= cfg.SECTEUR_MIN) percentilesGroupe(groupe, "pct_sect", winsoriser);
  }

  // 2) score mixte -> piliers -> total, et derives
  for (const t of titres) {
    melangeScores(t);
    const { piliers, total, couverture } = calculPiliers(t, "score_metrique", poidsPiliers);
    t.piliers = piliers;
    t.total = total;
    t.couverture = couverture;

    const assez = t.couverture >= cfg.SEUIL_COUVERTURE;
    t.note = (assez && t.total !== null) ? noteDe(t.total) : "NR";

    const det = alertesDe(t);
    t.alertes = det.length;
    t.alertes_detail = det;
    t.conviction = t.total !== null
      ? Math.max(0.0, t.total - t.alertes * cfg.MALUS_ALERTE)
      : null;

    const [forces, faiblesses] = forcesFaiblesses(t);
    t.forces = forces;
    t.faiblesses = faiblesses;

    const sv = t.piliers.Value;
    if (sv === null || sv === undefined) {
      t.valuation = "n/a";
      t.valo_niveau = 99;
    } else {
      const [lib, idx] = valuationDe(sv);
      t.valuation = lib;
      t.valo_niveau = idx;
    }

    const q = t.piliers.Quality, h = t.piliers.Health;
    t.sweet_spot = t.valo_niveau === 0 && assez
      && q !== null && q !== undefined && q >= cfg.SWEET_SPOT_QUALITE
      && h !== null && h !== undefined && h >= cfg.SWEET_SPOT_SANTE;
  }

  // 2bis) au-dessus de la mediane de l'univers sur Quality ET Value
  const medQ = mediane(titres.map((t) => t.piliers.Quality ?? null));
  const medV = mediane(titres.map((t) => t.piliers.Value ?? null));
  for (const t of titres) {
    const q = t.piliers.Quality, v = t.piliers.Value;
    t.qv_median = medQ !== null && medV !== null
      && q !== null && q !== undefined && q >= medQ
      && v !== null && v !== undefined && v >= medV;
  }

  // 3) classements (les scores absents sont classes derniers)
  const cle = (x) => (x === null || x === undefined ? -1.0 : x);
  const indices = [...Array(n).keys()];

  const ordreTotal = [...indices].sort((a, b) => cle(titres[b].total) - cle(titres[a].total));
  const rangsT = rangCompetition(ordreTotal, (i) => cle(titres[i].total));
  const ordreConv = [...indices].sort((a, b) => cle(titres[b].conviction) - cle(titres[a].conviction));
  const rangsC = rangCompetition(ordreConv, (i) => cle(titres[i].conviction));
  titres.forEach((t, i) => { t.rang = rangsT[i]; t.rang_conviction = rangsC[i]; });

  for (const groupe of Object.values(secteurs)) {
    const ids = [...Array(groupe.length).keys()];
    const ordre = [...ids].sort((a, b) => cle(groupe[b].total) - cle(groupe[a].total));
    const rangsS = rangCompetition(ordre, (k) => cle(groupe[k].total));
    groupe.forEach((t, k) => { t.rang_secteur = rangsS[k]; });
  }

  return titres;
}

// ---------------------------------------------------------------------
// Filtres (equivalent des options CLI du screener)
// ---------------------------------------------------------------------
export function appliquerFiltres(titres, o = {}) {
  let res = titres;
  if (o.minScore !== null && o.minScore !== undefined && o.minScore !== "")
    res = res.filter((t) => t.total !== null && t.total >= Number(o.minScore));
  if (o.maxAlertes !== null && o.maxAlertes !== undefined && o.maxAlertes !== "")
    res = res.filter((t) => t.alertes <= Number(o.maxAlertes));
  if (o.secteurs?.length) {
    const cibles = new Set(o.secteurs.map(norm));
    res = res.filter((t) => cibles.has(norm(t.Secteur)));
  }
  if (o.capMin !== null && o.capMin !== undefined && o.capMin !== "")
    res = res.filter((t) => (t.Cap ?? 0) >= Number(o.capMin));
  if (o.notes?.length) {
    const ok = new Set(o.notes.map((x) => x.toUpperCase()));
    res = res.filter((t) => ok.has(t.note.toUpperCase()));
  }
  if (o.valoAttractive) res = res.filter((t) => t.valo_niveau === 0);
  if (o.sweetSpot) res = res.filter((t) => t.sweet_spot);
  for (const [pilier, seuil] of Object.entries(o.pilierMin || {})) {
    if (seuil === "" || seuil === null || seuil === undefined) continue;
    res = res.filter((t) => (t.piliers[pilier] ?? 0) >= Number(seuil));
  }

  const cleTri = o.classerPar === "conviction" ? "conviction" : "total";
  res = [...res].sort((a, b) => (b[cleTri] ?? -1) - (a[cleTri] ?? -1));
  if (o.top) res = res.slice(0, Number(o.top));
  return res;
}

/** Enchainement complet, pret pour le rendu. */
export function analyser(titres, options = {}) {
  const poids = options.preset && cfg.PRESETS[options.preset]
    ? { ...cfg.PRESETS[options.preset] }
    : { ...cfg.POIDS_PILIERS };
  calculerScores(titres, poids, options.winsoriser !== false);
  const retenus = appliquerFiltres(titres, options);
  return { titres, retenus, poids, preset: options.preset || null };
}

export { PILIERS };
