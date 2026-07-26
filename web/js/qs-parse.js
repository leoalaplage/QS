// =====================================================================
//  QS - Lecture des donnees collees ou importees
//  Port de charger_csv() / _to_float() / _norm() de qs_screener.py.
//  Accepte : CSV (virgule), CSV francais (point-virgule), TSV (copier-
//  coller direct depuis Excel / Google Sheets / Numbers).
// =====================================================================

import * as cfg from "./qs-config.js";

// ---------------------------------------------------------------------
// Normalisation d'un libelle : minuscules, sans accents, sans separateurs
// ---------------------------------------------------------------------
export function norm(texte) {
  if (texte === null || texte === undefined) return "";
  return String(texte)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")   // retire les diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Suffixes d'ordre de grandeur, ramenes en milliards (base des cap. boursieres)
const MULT = { K: 1e-6, M: 1e-3, B: 1.0, T: 1e3 };
const VIDES = new Set(["", "N/A", "NA", "#N/A", "NAN", "NEUTRAL", "-", "--", "NM", "NMF"]);

/**
 * Convertit une cellule en nombre. Robuste aux exports type fiscal.ai :
 * symboles monetaires, %, separateurs de milliers, suffixes B/M/T/K,
 * negatifs entre parentheses. Renvoie null si la cellule est vide.
 */
export function toFloat(valeur) {
  if (valeur === null || valeur === undefined) return null;
  let s = String(valeur).trim();
  if (VIDES.has(s.toUpperCase())) return null;

  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    neg = true;
    s = s.slice(1, -1);
  }
  for (const ch of [" ", " ", " ", "$", "€", "£", "¥", "%"]) {
    s = s.split(ch).join("");
  }
  if (s[0] === "+") s = s.slice(1);
  if (s[0] === "-" || s[0] === "−") {
    neg = true;
    s = s.slice(1);
  }

  let mult = 1.0;
  const dernier = s.slice(-1);
  if ("KkMmBbTt".includes(dernier) && /\d/.test(s.slice(0, -1))) {
    mult = MULT[dernier.toUpperCase()];
    s = s.slice(0, -1);
  }

  // Separateur decimal : ambigu si virgule ET point sont presents
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.split(".").join("").replace(",", ".");
    } else {
      s = s.split(",").join("");
    }
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  if (s === "" || !/^\d*\.?\d+([eE][+-]?\d+)?$/.test(s)) return null;
  const v = parseFloat(s) * mult;
  if (!isFinite(v)) return null;
  return neg ? -v : v;
}

// ---------------------------------------------------------------------
// Parsing CSV / TSV (gere les guillemets et les retours a la ligne dedans)
// ---------------------------------------------------------------------
export function detecterDelimiteur(texte) {
  const premiere = texte.split(/\r?\n/, 1)[0] || "";
  let meilleur = ",", max = -1;
  for (const d of [",", ";", "\t"]) {
    // compte les occurrences hors guillemets
    let n = 0, dansGuillemets = false;
    for (const c of premiere) {
      if (c === '"') dansGuillemets = !dansGuillemets;
      else if (c === d && !dansGuillemets) n++;
    }
    if (n > max) { max = n; meilleur = d; }
  }
  return max > 0 ? meilleur : ",";
}

export function parserTableau(texte, delimiteur = null) {
  let t = texte.replace(/^﻿/, "");           // BOM
  const d = delimiteur || detecterDelimiteur(t);
  const lignes = [];
  let champ = "", ligne = [], dansGuillemets = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (t[i + 1] === '"') { champ += '"'; i++; }
        else dansGuillemets = false;
      } else champ += c;
      continue;
    }
    if (c === '"') { dansGuillemets = true; continue; }
    if (c === d) { ligne.push(champ); champ = ""; continue; }
    if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; continue; }
    if (c === "\r") continue;
    champ += c;
  }
  if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }

  // retire les lignes entierement vides
  return lignes.filter((l) => l.some((c) => c.trim() !== ""));
}

// ---------------------------------------------------------------------
// Mapping des colonnes -> enregistrements exploitables par le moteur
// ---------------------------------------------------------------------
function trouverColonne(entetesNorm, aliases) {
  for (const alias of aliases) {
    const cle = norm(alias);
    if (cle in entetesNorm) return entetesNorm[cle];
  }
  return null;
}

/** Croissance par action : (1+g_total)/(1+g_actions) - 1, en %. */
function parAction(cagrTotal, cagrActions) {
  if (cagrTotal === null || cagrActions === null) return null;
  const denom = 1.0 + cagrActions / 100.0;
  if (denom <= 0) return null;
  return ((1.0 + cagrTotal / 100.0) / denom - 1.0) * 100.0;
}

/**
 * Transforme un texte colle/importe en {titres, manquantes, avertissements}.
 * Leve une Error avec un message lisible si le tableau est inutilisable.
 */
export function chargerTableau(texte, options = {}) {
  const lignes = parserTableau(texte, options.delimiteur || null);
  if (lignes.length < 2) {
    throw new Error(
      "Need at least a header row and one data row. " +
      "Paste the table including its first row of column titles."
    );
  }

  const entetes = lignes[0].map((h) => h.trim());
  const entetesNorm = {};
  entetes.forEach((h) => { if (h) entetesNorm[norm(h)] = h; });

  const colTicker = trouverColonne(entetesNorm, cfg.COLONNE_TICKER);
  if (colTicker === null) {
    throw new Error(
      "No 'Ticker' column found. Headers read: " +
      entetes.filter(Boolean).slice(0, 12).join(", ") +
      (entetes.length > 12 ? "..." : "")
    );
  }
  const colSecteur = trouverColonne(entetesNorm, cfg.COLONNE_SECTEUR);
  const colCap = trouverColonne(entetesNorm, cfg.COLONNE_CAP);

  const mapping = {};
  for (const m of cfg.METRIQUES) mapping[m.cle] = trouverColonne(entetesNorm, m.entetes);
  const mappingRef = {};
  for (const r of cfg.COLONNES_REFERENCE) mappingRef[r.cle] = trouverColonne(entetesNorm, r.entetes);

  const idx = {};
  entetes.forEach((h, i) => { if (h && !(h in idx)) idx[h] = i; });
  const cell = (ligne, colonne) =>
    colonne !== null && idx[colonne] !== undefined ? (ligne[idx[colonne]] ?? "") : "";

  const titres = [];
  for (const ligne of lignes.slice(1)) {
    const ticker = String(cell(ligne, colTicker)).trim();
    if (!ticker) continue;

    let secteur = colSecteur ? String(cell(ligne, colSecteur)).trim() : "";
    if (!secteur) {
      const cle = Object.keys(cfg.SECTEURS_DEFAUT).find((k) => norm(k) === norm(ticker));
      secteur = cle ? cfg.SECTEURS_DEFAUT[cle] : "(n/a)";
    }

    const rec = {
      Ticker: ticker,
      Secteur: secteur,
      Cap: colCap ? toFloat(cell(ligne, colCap)) : null,
      brut: {}, ref: {},
    };
    for (const m of cfg.METRIQUES) rec.brut[m.cle] = mapping[m.cle] ? toFloat(cell(ligne, mapping[m.cle])) : null;
    for (const r of cfg.COLONNES_REFERENCE) rec.ref[r.cle] = mappingRef[r.cle] ? toFloat(cell(ligne, mappingRef[r.cle])) : null;

    // OCF/Capex derive si la colonne ratio est absente
    if (rec.brut.OCF_Capex === null) {
      const ocf = rec.ref.OCF, capex = rec.ref.Capex;
      if (ocf !== null && capex !== null && capex !== 0) rec.brut.OCF_Capex = ocf / Math.abs(capex);
    }
    // Croissance PAR ACTION
    const dil = rec.brut.ShOut5;
    if (rec.brut.RevPS5 === null) rec.brut.RevPS5 = parAction(rec.brut.Rev5, dil);
    if (rec.brut.FCFPS5 === null) rec.brut.FCFPS5 = parAction(rec.brut.LevFCF5, dil);

    titres.push(rec);
  }

  if (!titres.length) {
    throw new Error("No usable row: the Ticker column is empty on every line.");
  }

  // metrique "manquante" = aucune valeur exploitable sur tout l'univers
  const manquantes = cfg.METRIQUES
    .filter((m) => titres.every((t) => t.brut[m.cle] === null))
    .map((m) => m.cle);

  const avertissements = [];
  if (!colSecteur) avertissements.push("No 'Sector' column: sectors filled in from the built-in table.");
  if (!colCap) avertissements.push("No 'Market Cap' column: the Cap column will stay empty.");

  return { titres, manquantes, avertissements };
}
