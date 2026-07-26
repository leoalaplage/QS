// =====================================================================
//  QS Chart - Trace du graphe sur <canvas>
//  Derive de tracer() (matplotlib) de qs_chart.py, puis etendu :
//    - plusieurs societes ET plusieurs metriques sur un meme graphe ;
//    - double axe Y quand deux familles d'unites cohabitent ($ et %) ;
//    - courbes ou barres, au choix ;
//    - superpositions moyenne / plus haut / plus bas ;
//    - renvoie sa geometrie, pour que l'interface puisse retrouver le
//      point survole par la souris.
// =====================================================================

export const COULEURS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2",
  "#db2777", "#65a30d"];

const FIG_L = 11, FIG_H = 6;   // pouces, comme figsize=(11, 6)

const SYMBOLES = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", CHF: "CHF ", CAD: "C$", AUD: "A$" };
const symbole = (devise) => SYMBOLES[devise] || (devise ? `${devise} ` : "$");

// Types de trace proposes. "auto" est resolu par l'appelant.
export const TYPES_GRAPHE = [
  ["line", "Line"],
  ["area", "Area"],
  ["step", "Stepped line"],
  ["bar", "Bars"],
  ["bar-stacked", "Stacked bars"],
  ["scatter", "Points only"],
];

// Familles d'unites : deux metriques de la meme famille partagent un axe.
export const familleUnite = (u) => (u === "money" || u === "per_share" ? "money"
  : u === "pct" ? "pct" : u === "shares" ? "shares"
    : u === "indice" ? "indice" : "ratio");

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

/**
 * Decimales d'un pourcentage. Au-dessus de 10 % l'unite suffit : afficher
 * « 49.9% » pour une marge est un faux gain de precision, on ecrit « 50% ».
 * En dessous, la decimale porte l'information (un FCF yield de 2,4 % ne doit
 * pas devenir 2 %).
 */
const decimalesPct = (v) => (Math.abs(v) >= 10 ? 0 : 1);

/** Etiquette d'une valeur, selon l'unite de sa metrique. */
export function etiquetteValeur(v, unite, devise) {
  switch (unite) {
    case "money": return fmtMontant(v, devise);
    case "pct": return `${v.toFixed(decimalesPct(v))}%`;
    case "per_share": return `${symbole(devise)}${v.toFixed(2)}`;
    case "shares": return fmtShares(v);
    case "ratio": return v.toFixed(2);
    case "indice": return v.toFixed(1);
    default: return fmtG(v);
  }
}

function etiquetteAxe(v, unite, pas, devise) {
  switch (unite) {
    case "money": return fmtMontant(v, devise);
    case "pct": {
      // sur un axe, c'est le PAS qui dicte la precision utile
      const dec = pas >= 1 ? 0 : pas >= 0.1 ? 1 : 2;
      return `${v.toFixed(dec)}%`;
    }
    case "per_share": return `${symbole(devise)}${v.toFixed(2)}`;
    case "shares": return fmtShares(v);
    case "ratio": return v.toFixed(1);
    case "indice": return v.toFixed(0);
    default: return fmtG(v);
  }
}

// ---------------------------------------------------------------------
// Graduations
// ---------------------------------------------------------------------
/**
 * Pas "rond" donnant un nombre de graduations proche de la cible. On evalue
 * les candidats au lieu d'arrondir au superieur : un pas brut a peine
 * au-dessus d'un palier doublerait sinon la graduation et viderait le graphe.
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

/** Axe X : toujours des annees entieres, meme en trimestriel. */
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

/** Statistiques d'une serie, pour les superpositions et l'infobulle. */
export function stats(points) {
  if (!points.length) return null;
  const ys = points.map((p) => p.y);
  const somme = ys.reduce((a, b) => a + b, 0);
  let haut = points[0], bas = points[0];
  for (const p of points) {
    if (p.y > haut.y) haut = p;
    if (p.y < bas.y) bas = p;
  }
  const tri = [...ys].sort((a, b) => a - b);
  const m = Math.floor(tri.length / 2);
  const mediane = tri.length % 2 ? tri[m] : (tri[m - 1] + tri[m]) / 2;
  return { moyenne: somme / ys.length, mediane, haut, bas, dernier: points[points.length - 1] };
}

/** Droite des moindres carres : y = a.x + b. null si elle n'a pas de sens. */
export function tendance(points) {
  const n = points.length;
  if (n < 3) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const denom = n * sxx - sx * sx;
  if (!denom) return null;
  const a = (n * sxy - sx * sy) / denom;
  return { a, b: (sy - a * sx) / n };
}

// ---------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------
/**
 * @param {object} o
 *   series   : [{id, libelle, points:[{x,etiquette,y}], unite, devise, couleur, type}]
 *   titre    : titre du graphe
 *   sousAxeX : libelle de l'axe X
 *   overlays : {moyenne:bool, extremes:bool}
 * @returns {{canvas, geo}} geo sert au survol : il porte les fonctions de
 *          conversion valeur <-> pixel et les points effectivement traces.
 */
export function tracer({
  series, titre = "", sousAxeX = "Fiscal year", dpi = 200,
  etiquettes: montreEtiquettesDemande = "auto", logY = false,
} = {}) {
  const visibles = series.filter((s) => s.points && s.points.length);
  if (!visibles.length) throw new Error("No data to plot.");

  const U = dpi / 72;
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

  // -- repartition sur un ou deux axes ---------------------------------
  const familles = [...new Set(visibles.map((s) => familleUnite(s.unite)))];
  const axes = familles.slice(0, 2);
  for (const s of visibles) s.axe = Math.max(0, axes.indexOf(familleUnite(s.unite)));

  // -- bornes ----------------------------------------------------------
  let xMinD = Infinity, xMaxD = -Infinity;
  const bornesY = axes.map(() => ({ min: Infinity, max: -Infinity }));
  for (const s of visibles) {
    for (const p of s.points) {
      xMinD = Math.min(xMinD, p.x); xMaxD = Math.max(xMaxD, p.x);
      const b = bornesY[s.axe];
      b.min = Math.min(b.min, p.y); b.max = Math.max(b.max, p.y);
    }
  }

  const pasX = visibles.some((s) => s.points.length > 1)
    ? Math.min(...visibles.filter((s) => s.points.length > 1)
        .map((s) => Math.min(...s.points.slice(1).map((p, i) => p.x - s.points[i].x))))
    : 1;

  const barres = visibles.filter((s) => s.type === "bar");
  const empilees = visibles.filter((s) => s.type === "bar-stacked");
  const aireOuBarre = visibles.filter((s) => ["bar", "bar-stacked", "area"].includes(s.type));
  const largeurGroupe = 0.68 * (pasX || 1);
  if (barres.length || empilees.length) {
    xMinD -= largeurGroupe / 2;
    xMaxD += largeurGroupe / 2;
  }
  // barres et aires s'appuient sur zero : il doit rester dans le cadrage
  for (const s of aireOuBarre) {
    const b = bornesY[s.axe];
    b.min = Math.min(b.min, 0);
    b.max = Math.max(b.max, 0);
  }
  // une pile monte plus haut que sa plus grande composante
  if (empilees.length) {
    const cumul = new Map();
    for (const s of empilees) {
      for (const p of s.points) cumul.set(p.x, (cumul.get(p.x) || 0) + p.y);
    }
    for (const v of cumul.values()) {
      const b = bornesY[empilees[0].axe];
      b.min = Math.min(b.min, v);
      b.max = Math.max(b.max, v);
    }
  }

  const etX = (xMaxD - xMinD) || 1;
  const xMin = xMinD - 0.03 * etX, xMax = xMaxD + 0.03 * etX;

  // Etiquettes de valeur : "auto" ne les montre que si elles restent lisibles.
  const nbPoints = visibles.reduce((a, s) => a + s.points.length, 0);
  const montreEtiquettes = montreEtiquettesDemande === true
    || (montreEtiquettesDemande === "auto" && visibles.length === 1 && nbPoints <= 22);

  const echelles = bornesY.map((b, i) => {
    const etY = (b.max - b.min) || Math.abs(b.max) || 1;
    const seulementBarres = visibles.filter((s) => s.axe === i)
      .every((s) => ["bar", "bar-stacked", "area"].includes(s.type));
    const colleBas = seulementBarres && b.min === 0;
    const colleHaut = seulementBarres && b.max === 0;
    const min = colleBas ? 0 : b.min - 0.05 * etY;
    const max = colleHaut ? 0 : b.max + (montreEtiquettes ? 0.13 : 0.08) * etY;
    return { min, max, ...graduations(min, max) };
  });

  const ticksX = graduationsAnnees(Math.ceil(xMin), Math.floor(xMax));

  // -- geometrie -------------------------------------------------------
  const uniteAxe = (i) => visibles.find((s) => s.axe === i);
  police(10);
  const largeurEtiq = echelles.map((e, i) => {
    const s = uniteAxe(i);
    return Math.max(...e.ticks.map((t) => c.measureText(etiquetteAxe(t, s.unite, e.pas, s.devise)).width));
  });

  const gauche = largeurEtiq[0] + 12 * U;
  const droite = L - (echelles.length > 1 ? largeurEtiq[1] + 14 * U : 10 * U);
  const haut = 38 * U;
  const bas = H - 46 * U;

  const xPx = (x) => gauche + ((x - xMin) / (xMax - xMin)) * (droite - gauche);
  const yPxAxe = (y, i) => {
    const e = echelles[i];
    return bas - ((y - e.min) / (e.max - e.min)) * (bas - haut);
  };

  // -- grille ----------------------------------------------------------
  c.save();
  c.strokeStyle = "rgba(176,176,176,0.5)";
  c.lineWidth = 0.6 * U;
  c.setLineDash([5 * U, 3 * U]);
  for (const t of echelles[0].ticks) {
    const y = yPxAxe(t, 0);
    c.beginPath(); c.moveTo(gauche, y); c.lineTo(droite, y); c.stroke();
  }
  c.restore();

  for (let i = 0; i < echelles.length; i++) {
    if (echelles[i].min < 0 && echelles[i].max > 0) {
      c.strokeStyle = "#94a3b8"; c.lineWidth = 0.8 * U;
      const y = yPxAxe(0, i);
      c.beginPath(); c.moveTo(gauche, y); c.lineTo(droite, y); c.stroke();
      break;
    }
  }

  // -- series ----------------------------------------------------------
  const etiquettes = [];
  const largeurBarre = barres.length ? largeurGroupe / barres.length : largeurGroupe;
  const basePile = new Map();   // x -> hauteur deja empilee

  visibles.forEach((s) => {
    const y = (v) => yPxAxe(v, s.axe);
    const w = (largeurBarre / (xMax - xMin)) * (droite - gauche);

    if (s.type === "bar" || s.type === "bar-stacked") {
      const empile = s.type === "bar-stacked";
      const rang = empile ? 0 : barres.indexOf(s);
      const decalage = empile ? 0 : (rang - (barres.length - 1) / 2) * w;
      c.fillStyle = s.couleur;
      c.strokeStyle = "#ffffff";
      c.lineWidth = 0.5 * U;
      for (const p of s.points) {
        const socle = empile ? (basePile.get(p.x) || 0) : 0;
        if (empile) basePile.set(p.x, socle + p.y);
        const yHaut = y(socle + p.y), yBas = y(socle);
        const cx = xPx(p.x) + decalage;
        c.fillRect(cx - w / 2, Math.min(yHaut, yBas), w, Math.abs(yHaut - yBas));
        if (w > 3 * U) c.strokeRect(cx - w / 2, Math.min(yHaut, yBas), w, Math.abs(yHaut - yBas));
        if (montreEtiquettes) {
          etiquettes.push({ x: cx, y: p.y >= 0 ? yHaut - 4 * U : yHaut + 12 * U,
            texte: etiquetteValeur(p.y, s.unite, s.devise) });
        }
      }
      return;
    }

    if (s.type === "scatter") {
      c.fillStyle = s.couleur;
      for (const p of s.points) {
        c.beginPath(); c.arc(xPx(p.x), y(p.y), 3.2 * U, 0, Math.PI * 2); c.fill();
        if (montreEtiquettes) {
          etiquettes.push({ x: xPx(p.x), y: y(p.y) - 8 * U,
            texte: etiquetteValeur(p.y, s.unite, s.devise) });
        }
      }
      return;
    }

    // line / area / step : meme chemin, remplissage et paliers en option
    const escalier = s.type === "step";
    const chemin = () => {
      c.beginPath();
      s.points.forEach((p, idx) => {
        const px = xPx(p.x), py = y(p.y);
        if (idx === 0) { c.moveTo(px, py); return; }
        if (escalier) {
          const precedent = s.points[idx - 1];
          c.lineTo(px, y(precedent.y));
        }
        c.lineTo(px, py);
      });
    };

    if (s.type === "area") {
      chemin();
      const y0 = y(Math.max(echelles[s.axe].min, 0));
      c.lineTo(xPx(s.points[s.points.length - 1].x), y0);
      c.lineTo(xPx(s.points[0].x), y0);
      c.closePath();
      c.save();
      c.globalAlpha = 0.18;
      c.fillStyle = s.couleur;
      c.fill();
      c.restore();
    }

    c.strokeStyle = s.couleur;
    c.lineWidth = 2.2 * U;
    c.lineJoin = "round";
    chemin();
    c.stroke();

    c.fillStyle = s.couleur;
    const rayon = s.points.length > 40 ? 1.6 : 2.5;
    for (const p of s.points) {
      c.beginPath(); c.arc(xPx(p.x), y(p.y), rayon * U, 0, Math.PI * 2); c.fill();
      if (montreEtiquettes) {
        etiquettes.push({ x: xPx(p.x), y: y(p.y) - 8 * U,
          texte: etiquetteValeur(p.y, s.unite, s.devise) });
      }
    }
  });

  // -- superpositions, activees SERIE PAR SERIE -------------------------
  for (const s of visibles) {
    const o = s.overlays || {};
    if (!o.moyenne && !o.mediane && !o.extremes && !o.tendance) continue;
    const st = stats(s.points);
    if (!st) continue;
    const y = (v) => yPxAxe(v, s.axe);

    for (const [actif, valeur, tag] of [
      [o.moyenne, st.moyenne, "avg"],
      [o.mediane, st.mediane, "med"],
    ]) {
      if (!actif) continue;
      c.save();
      c.strokeStyle = s.couleur;
      c.globalAlpha = 0.55;
      c.lineWidth = 1.4 * U;
      c.setLineDash(tag === "avg" ? [7 * U, 4 * U] : [2 * U, 3 * U]);
      const ym = y(valeur);
      c.beginPath(); c.moveTo(gauche, ym); c.lineTo(droite, ym); c.stroke();
      c.restore();
      police(8);
      c.fillStyle = s.couleur;
      c.textAlign = "left";
      c.fillText(`${tag} ${etiquetteValeur(valeur, s.unite, s.devise)}`, gauche + 4 * U, y(valeur) - 7 * U);
    }

    if (o.tendance) {
      const t = tendance(s.points);
      if (t) {
        const x0 = s.points[0].x, x1 = s.points[s.points.length - 1].x;
        c.save();
        c.strokeStyle = s.couleur;
        c.globalAlpha = 0.7;
        c.lineWidth = 1.6 * U;
        c.setLineDash([10 * U, 5 * U]);
        c.beginPath();
        c.moveTo(xPx(x0), y(t.a * x0 + t.b));
        c.lineTo(xPx(x1), y(t.a * x1 + t.b));
        c.stroke();
        c.restore();
      }
    }

    if (o.extremes) {
      police(8, true);
      for (const [pt, tag] of [[st.haut, "high"], [st.bas, "low"]]) {
        const px = xPx(pt.x), py = y(pt.y);
        c.beginPath();
        c.arc(px, py, 4.5 * U, 0, Math.PI * 2);
        c.strokeStyle = s.couleur; c.lineWidth = 1.6 * U; c.stroke();
        c.fillStyle = s.couleur;
        c.textAlign = "center";
        c.fillText(`${tag} ${etiquetteValeur(pt.y, s.unite, s.devise)}`,
          px, tag === "high" ? py - 13 * U : py + 13 * U);
      }
      c.textAlign = "left";
    }
  }

  police(7.5);
  c.fillStyle = "#334155";
  c.textAlign = "center";
  for (const e of etiquettes) c.fillText(e.texte, e.x, e.y);
  c.textAlign = "left";

  // -- axes ------------------------------------------------------------
  c.strokeStyle = "#000000";
  c.lineWidth = 0.8 * U;
  c.beginPath();
  c.moveTo(gauche, haut); c.lineTo(gauche, bas); c.lineTo(droite, bas);
  if (echelles.length > 1) { c.moveTo(droite, haut); c.lineTo(droite, bas); }
  c.stroke();

  police(10);
  c.strokeStyle = "#475569";
  echelles.forEach((e, i) => {
    const s = uniteAxe(i);
    c.fillStyle = echelles.length > 1 ? s.couleur : "#475569";
    c.textAlign = i === 0 ? "right" : "left";
    for (const t of e.ticks) {
      const y = yPxAxe(t, i);
      c.beginPath();
      c.moveTo(i === 0 ? gauche - 3.5 * U : droite, y);
      c.lineTo(i === 0 ? gauche : droite + 3.5 * U, y);
      c.stroke();
      c.fillText(etiquetteAxe(t, s.unite, e.pas, s.devise), i === 0 ? gauche - 6 * U : droite + 6 * U, y);
    }
  });

  c.fillStyle = "#475569";
  c.textAlign = "center";
  for (const t of ticksX) {
    const x = xPx(t);
    if (x < gauche - 1 || x > droite + 1) continue;
    c.beginPath(); c.moveTo(x, bas); c.lineTo(x, bas + 3.5 * U); c.stroke();
    c.fillText(String(t), x, bas + 12 * U);
  }

  // -- titre, libelles, source -----------------------------------------
  police(14, true);
  c.fillStyle = "#0f172a";
  c.fillText(titre, (gauche + droite) / 2, 16 * U);

  police(10);
  c.fillStyle = "#475569";
  c.fillText(sousAxeX, (gauche + droite) / 2, bas + 28 * U);

  police(8);
  c.fillStyle = "#94a3b8";
  c.textAlign = "right";
  c.fillText("Source: SEC EDGAR (XBRL)  -  QS Chart", L - 0.01 * L, H - 0.02 * H);
  c.textAlign = "left";

  // -- legende ---------------------------------------------------------
  police(9);
  const hLigne = 13 * U;
  // Le CAGR n'a de sens que sur une grandeur qui croit : un ratio ou une
  // marge n'en recoit pas, un montant negatif non plus.
  for (const s of visibles) {
    // un indice rebase porte la meme croissance que la serie d'origine
    const g = ["money", "per_share", "shares", "indice"].includes(s.unite) ? cagr(s.points) : null;
    s.libelleLegende = s.libelle
      + (g !== null ? `  (CAGR ${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}%)` : "");
  }
  const largeurLeg = Math.max(...visibles.map((s) => c.measureText(s.libelleLegende).width));
  let sommeG = 0, nG = 0, sommeD = 0, nD = 0;
  const milieu = (xMin + xMax) / 2;
  for (const s of visibles) {
    const e = echelles[s.axe];
    for (const p of s.points) {
      const norme = (p.y - e.min) / ((e.max - e.min) || 1);
      if (p.x < milieu) { sommeG += norme; nG++; } else { sommeD += norme; nD++; }
    }
  }
  const gaucheEstBas = (nG ? sommeG / nG : 0) <= (nD ? sommeD / nD : 0);
  const xLeg = gaucheEstBas ? gauche + 12 * U : droite - largeurLeg - 26 * U;
  let yLeg = haut + 10 * U;
  for (const s of visibles) {
    c.strokeStyle = s.couleur;
    c.lineWidth = 2.2 * U;
    c.beginPath(); c.moveTo(xLeg, yLeg); c.lineTo(xLeg + 16 * U, yLeg); c.stroke();
    c.fillStyle = "#333333";
    c.fillText(s.libelleLegende, xLeg + 21 * U, yLeg);
    yLeg += hLigne;
  }

  // -- geometrie renvoyee pour le survol --------------------------------
  const geo = {
    L, H, gauche, droite, haut, bas, xMin, xMax,
    series: visibles.map((s) => ({
      id: s.id, libelle: s.libelle, couleur: s.couleur, unite: s.unite, devise: s.devise,
      points: s.points.map((p) => ({ ...p, px: xPx(p.x), py: yPxAxe(p.y, s.axe) })),
    })),
    // abscisses distinctes, pour caler l'infobulle sur une periode
    abscisses: [...new Set(visibles.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b),
    xPx,
  };

  return { canvas, geo };
}
