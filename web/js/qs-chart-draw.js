// =====================================================================
//  QS Chart - Trace du graphe sur <canvas>
//  Reprend le rendu de tracer() (matplotlib) de qs_chart.py : memes
//  couleurs, memes formats d'etiquettes, meme CAGR en legende, barres pour
//  une seule entreprise, lignes des qu'il y en a plusieurs.
//  Etendu : axe X en trimestres (X non entier) et devises autres que l'USD.
// =====================================================================

import { decoderCle, MODES } from "./qs-chart-edgar.js";

export const COULEURS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2"];

const FIG_L = 11, FIG_H = 6;   // pouces, comme figsize=(11, 6)

const SYMBOLES = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", CHF: "CHF ", CAD: "C$", AUD: "A$" };
const symbole = (devise) => SYMBOLES[devise] || (devise ? `${devise} ` : "$");

// ---------------------------------------------------------------------
// Formatage des valeurs
// ---------------------------------------------------------------------
export function fmtMontant(v, devise = "USD") {
  const s = symbole(devise);
  const a = Math.abs(v);
  if (a >= 1e12) return `${s}${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}${(v / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${s}${(v / 1e3).toFixed(0)}K`;
  return `${s}${v.toFixed(0)}`;
}

export function fmtShares(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toFixed(0);
}

const fmtG = (v) => String(parseFloat(Number(v).toPrecision(6)));

/** Etiquette au-dessus d'un point / d'une barre. */
export function etiquetteValeur(v, unite, devise) {
  switch (unite) {
    case "money": return fmtMontant(v, devise);
    case "pct": return `${v.toFixed(1)}%`;
    case "per_share": return `${symbole(devise)}${v.toFixed(2)}`;
    case "shares": return fmtShares(v);
    case "ratio": return v.toFixed(2);
    case "number": return fmtG(v);
    default: return v.toFixed(2);
  }
}

/** Etiquette de graduation de l'axe Y (decimales adaptees au pas). */
function etiquetteAxe(v, unite, pas, devise) {
  switch (unite) {
    case "money": return fmtMontant(v, devise);
    case "pct": {
      const dec = pas >= 1 ? 0 : pas >= 0.1 ? 1 : 2;
      return `${v.toFixed(dec)}%`;
    }
    case "per_share": return `${symbole(devise)}${v.toFixed(2)}`;
    case "shares": return fmtShares(v);
    case "ratio": return v.toFixed(1);
    default: return fmtG(v);
  }
}

// ---------------------------------------------------------------------
// Graduations "jolies" facon MaxNLocator
// ---------------------------------------------------------------------
/**
 * Choisit un pas "rond" donnant un nombre de graduations proche de la cible.
 * On evalue les candidats au lieu d'arrondir au superieur : un pas brut a
 * peine au-dessus d'un palier (250 000 001 pour un palier a 2,5e8) doublerait
 * sinon la graduation et viderait le graphe de ses reperes.
 */
function pasJoli(brut, cible) {
  const exposant = Math.floor(Math.log10(brut));
  let meilleur = null, meilleurEcart = Infinity;
  for (const e of [exposant - 1, exposant, exposant + 1]) {
    const base = Math.pow(10, e);
    for (const m of [1, 2, 2.5, 5]) {
      const pas = m * base;
      const ecart = Math.abs(brut * cible / pas - cible);
      if (ecart < meilleurEcart) { meilleurEcart = ecart; meilleur = pas; }
    }
  }
  return meilleur;
}

function graduations(min, max, cible = 9) {
  if (!isFinite(min) || !isFinite(max)) return { ticks: [0], pas: 1 };
  if (min === max) { const d = Math.abs(min) || 1; min -= d * 0.5; max += d * 0.5; }
  const pas = pasJoli((max - min) / cible, cible);
  const debut = Math.ceil(min / pas) * pas;
  const ticks = [];
  for (let v = debut; v <= max + pas * 1e-9; v += pas) {
    ticks.push(Math.abs(v) < pas * 1e-9 ? 0 : v);
  }
  return { ticks, pas };
}

/** Graduations de l'axe X : toujours des annees entieres, meme en trimestriel. */
function graduationsAnnees(min, max, maxTicks = 11) {
  const etendue = Math.max(1, max - min);
  let pas = 1;
  for (const p of [1, 2, 5, 10, 20, 25, 50]) { pas = p; if (etendue / p <= maxTicks - 1) break; }
  const debut = Math.ceil(min / pas) * pas;
  const ticks = [];
  for (let v = debut; v <= max; v += pas) ticks.push(v);
  return ticks.length ? ticks : [Math.round(min)];
}

/** CAGR entre le 1er et le dernier point. x en annees decimales. */
export function cagr(points) {
  if (points.length < 2) return null;
  const a = points[0], b = points[points.length - 1];
  if (a.y <= 0 || b.y <= 0) return null;
  const n = b.x - a.x;
  if (n <= 0) return null;
  return Math.pow(b.y / a.y, 1 / n) - 1;
}

// ---------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------
/**
 * @param {object} meta   {nom, unite, graph}
 * @param {object} seriesParTicker  {TICKER: {clePeriode: valeur}}
 * @param {object} noms   {TICKER: raison sociale}
 * @param {object} o      {anneesFenetre, mode, devise, dpi}
 * @returns {HTMLCanvasElement}
 */
export function tracer(meta, seriesParTicker, noms, {
  anneesFenetre = 15, mode = MODES.ANNUEL, devise = "USD", dpi = 200,
} = {}) {
  const U = dpi / 72;                       // pixels par point typographique
  const L = Math.round(FIG_L * dpi);
  const H = Math.round(FIG_H * dpi);

  const canvas = document.createElement("canvas");
  canvas.width = L;
  canvas.height = H;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, L, H);
  c.textBaseline = "middle";

  const police = (pt, gras = false) => {
    c.font = `${gras ? "bold " : ""}${pt * U}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  };

  const unite = meta.unite;
  const tickers = Object.keys(seriesParTicker);
  const multi = tickers.length > 1;
  const trimestriel = mode !== MODES.ANNUEL;
  // en trimestriel les barres deviennent illisibles : on passe en lignes
  const typeGraph = (multi || trimestriel) ? "line" : meta.graph;

  // -- fenetre temporelle : N dernieres annees, union des tickers ------
  let xMaxD = -Infinity;
  for (const s of Object.values(seriesParTicker)) {
    for (const k of Object.keys(s)) xMaxD = Math.max(xMaxD, decoderCle(k).x);
  }
  if (!isFinite(xMaxD)) throw new Error("No data to plot.");
  const xMinFenetre = xMaxD - anneesFenetre + (trimestriel ? 0.75 : 1);

  // -- points retenus, par ticker --------------------------------------
  const jeux = [];
  tickers.forEach((tk, i) => {
    const serie = seriesParTicker[tk];
    const points = Object.keys(serie)
      .map((k) => ({ ...decoderCle(k), y: serie[k] }))
      .filter((p) => p.x >= xMinFenetre - 1e-9 && p.y !== null && p.y !== undefined && isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    if (!points.length) return;
    const g = ["money", "per_share", "shares"].includes(unite) ? cagr(points) : null;
    jeux.push({
      ticker: tk,
      points,
      couleur: COULEURS[i % COULEURS.length],
      libelle: tk + (g !== null ? `  (CAGR ${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}%)` : ""),
    });
  });
  if (!jeux.length) throw new Error("No data within the requested window.");

  // -- bornes de donnees ------------------------------------------------
  let xMinD = Infinity, yMinD = Infinity, yMaxD = -Infinity;
  xMaxD = -Infinity;
  for (const j of jeux) {
    for (const p of j.points) {
      xMinD = Math.min(xMinD, p.x); xMaxD = Math.max(xMaxD, p.x);
      yMinD = Math.min(yMinD, p.y); yMaxD = Math.max(yMaxD, p.y);
    }
  }
  const pasX = trimestriel ? 0.25 : 1;
  const largeurBarre = 0.62 * pasX;
  if (typeGraph === "bar") {
    xMinD -= largeurBarre / 2;
    xMaxD += largeurBarre / 2;
    yMinD = Math.min(yMinD, 0);            // un barplot inclut toujours 0
    yMaxD = Math.max(yMaxD, 0);
  }
  const etX = (xMaxD - xMinD) || 1;
  const xMin = xMinD - 0.03 * etX, xMax = xMaxD + 0.03 * etX;
  const etY = (yMaxD - yMinD) || Math.abs(yMaxD) || 1;
  // Les barres "collent" a leur base (sticky edges de matplotlib) : pas de
  // marge sous 0 quand tout est positif, pas de marge au-dessus quand tout
  // est negatif -- sinon l'axe flotte sous les barres.
  const colleBas = typeGraph === "bar" && yMinD === 0;
  const colleHaut = typeGraph === "bar" && yMaxD === 0;
  // etiquettes de valeur : seulement quand elles restent lisibles
  const nbPoints = jeux.reduce((a, j) => a + j.points.length, 0);
  const montreEtiquettes = !multi && nbPoints <= 22;
  const yMin = colleBas ? 0 : yMinD - 0.05 * etY;
  const yMax = colleHaut ? 0 : yMaxD + (montreEtiquettes ? 0.13 : 0.08) * etY;

  const { ticks: ticksY, pas } = graduations(yMin, yMax);
  const ticksX = graduationsAnnees(Math.ceil(xMin), Math.floor(xMax));

  // -- geometrie des axes ------------------------------------------------
  police(10);
  let largeurEtiqY = 0;
  for (const t of ticksY) {
    largeurEtiqY = Math.max(largeurEtiqY, c.measureText(etiquetteAxe(t, unite, pas, devise)).width);
  }

  const gauche = largeurEtiqY + 12 * U;
  const droite = L - 10 * U;
  const haut = 14 * U + 14 * U + 10 * U;             // titre (14pt) + pad
  const bas = H - (10 * U + 10 * U + 14 * U + 12 * U); // ticks + xlabel + source

  const xPx = (x) => gauche + ((x - xMin) / (xMax - xMin)) * (droite - gauche);
  const yPx = (y) => bas - ((y - yMin) / (yMax - yMin)) * (bas - haut);

  // -- grille horizontale ------------------------------------------------
  c.save();
  c.strokeStyle = "rgba(176,176,176,0.5)";
  c.lineWidth = 0.6 * U;
  c.setLineDash([5 * U, 3 * U]);
  for (const t of ticksY) {
    const y = yPx(t);
    c.beginPath();
    c.moveTo(gauche, y);
    c.lineTo(droite, y);
    c.stroke();
  }
  c.restore();

  // -- ligne zero si valeurs negatives -----------------------------------
  if (yMin < 0 && yMax > 0) {
    c.strokeStyle = "#94a3b8";
    c.lineWidth = 0.8 * U;
    c.beginPath();
    c.moveTo(gauche, yPx(0));
    c.lineTo(droite, yPx(0));
    c.stroke();
  }

  // -- series ------------------------------------------------------------
  const etiquettes = [];
  for (const j of jeux) {
    if (typeGraph === "bar") {
      const w = (largeurBarre / (xMax - xMin)) * (droite - gauche);
      const y0 = yPx(0);
      c.fillStyle = j.couleur;
      c.strokeStyle = "#ffffff";
      c.lineWidth = 0.5 * U;
      for (const p of j.points) {
        const y = yPx(p.y), cx = xPx(p.x);
        c.fillRect(cx - w / 2, Math.min(y, y0), w, Math.abs(y - y0));
        c.strokeRect(cx - w / 2, Math.min(y, y0), w, Math.abs(y - y0));
        if (montreEtiquettes) {
          etiquettes.push({
            x: cx, y: p.y >= 0 ? y - 4 * U : y + 12 * U,
            texte: etiquetteValeur(p.y, unite, devise),
          });
        }
      }
    } else {
      c.strokeStyle = j.couleur;
      c.fillStyle = j.couleur;
      c.lineWidth = 2.2 * U;
      c.lineJoin = "round";
      c.beginPath();
      j.points.forEach((p, k) => {
        const px = xPx(p.x), py = yPx(p.y);
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      });
      c.stroke();
      // marqueurs : allegés quand les points sont nombreux (trimestriel long)
      const rayon = j.points.length > 40 ? 1.6 : 2.5;
      for (const p of j.points) {
        const px = xPx(p.x), py = yPx(p.y);
        c.beginPath();
        c.arc(px, py, rayon * U, 0, Math.PI * 2);
        c.fill();
        if (montreEtiquettes) {
          etiquettes.push({ x: px, y: py - 8 * U, texte: etiquetteValeur(p.y, unite, devise) });
        }
      }
    }
  }

  police(7.5);
  c.fillStyle = "#334155";
  c.textAlign = "center";
  for (const e of etiquettes) c.fillText(e.texte, e.x, e.y);
  c.textAlign = "left";

  // -- axes (spines gauche + bas seulement) -------------------------------
  c.strokeStyle = "#000000";
  c.lineWidth = 0.8 * U;
  c.beginPath();
  c.moveTo(gauche, haut);
  c.lineTo(gauche, bas);
  c.lineTo(droite, bas);
  c.stroke();

  // graduations Y
  police(10);
  c.fillStyle = "#475569";
  c.strokeStyle = "#475569";
  c.lineWidth = 0.8 * U;
  c.textAlign = "right";
  for (const t of ticksY) {
    const y = yPx(t);
    c.beginPath();
    c.moveTo(gauche - 3.5 * U, y);
    c.lineTo(gauche, y);
    c.stroke();
    c.fillText(etiquetteAxe(t, unite, pas, devise), gauche - 6 * U, y);
  }
  // graduations X
  c.textAlign = "center";
  for (const t of ticksX) {
    const x = xPx(t);
    if (x < gauche - 1 || x > droite + 1) continue;
    c.beginPath();
    c.moveTo(x, bas);
    c.lineTo(x, bas + 3.5 * U);
    c.stroke();
    c.fillText(String(t), x, bas + 12 * U);
  }

  // -- titre, libelle d'axe, source ---------------------------------------
  const suffixe = mode === MODES.TTM ? " - TTM" : mode === MODES.TRIMESTRE ? " - quarterly" : "";
  const titre = multi
    ? `${meta.nom}${suffixe} - ${tickers.join(", ")}`
    : `${meta.nom}${suffixe} - ${noms[tickers[0]] || tickers[0]} (${tickers[0]})`;
  police(14, true);
  c.fillStyle = "#0f172a";
  c.textAlign = "center";
  c.fillText(titre, (gauche + droite) / 2, haut - 14 * U);

  police(10);
  c.fillStyle = "#475569";
  c.fillText(trimestriel ? "Period (calendar quarter of period end)" : "Fiscal year",
    (gauche + droite) / 2, bas + 28 * U);

  police(8);
  c.fillStyle = "#94a3b8";
  c.textAlign = "right";
  c.fillText("Source: SEC EDGAR (XBRL)  -  QS Chart", L - 0.01 * L, H - 0.02 * H);
  c.textAlign = "left";

  // -- legende (coin haut le plus vide) -----------------------------------
  police(9);
  const hLigne = 13 * U;
  let largeur = 0;
  for (const j of jeux) largeur = Math.max(largeur, c.measureText(j.libelle).width);

  let sommeG = 0, nG = 0, sommeD = 0, nD = 0;
  const milieu = (xMin + xMax) / 2;
  for (const j of jeux) {
    for (const p of j.points) {
      if (p.x < milieu) { sommeG += p.y; nG++; } else { sommeD += p.y; nD++; }
    }
  }
  const gaucheEstBas = (nG ? sommeG / nG : 0) <= (nD ? sommeD / nD : 0);
  const xLeg = gaucheEstBas ? gauche + 12 * U : droite - largeur - 26 * U;
  let yLeg = haut + 10 * U;

  for (const j of jeux) {
    c.strokeStyle = j.couleur;
    c.lineWidth = 2.2 * U;
    c.beginPath();
    c.moveTo(xLeg, yLeg);
    c.lineTo(xLeg + 16 * U, yLeg);
    c.stroke();
    c.fillStyle = "#333333";
    c.fillText(j.libelle, xLeg + 21 * U, yLeg);
    yLeg += hLigne;
  }

  return canvas;
}
