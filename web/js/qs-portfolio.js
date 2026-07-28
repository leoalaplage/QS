// =====================================================================
//  QS Portfolio - fiche A4 d'un portefeuille
//
//  Une page, six blocs : allocation, secteurs, geographie, taille de
//  capitalisation, financiers ponderes, et performance quand le prix de
//  revient est fourni.
//
//  CE QUI EST PONDERE, ET COMMENT
//  Un portefeuille n'a pas de marge brute : ses lignes en ont. Les
//  agregats sont donc des moyennes PONDEREES PAR LE POIDS de chaque
//  ligne, et la ponderation est renormalisee sur les seules lignes qui
//  disposent de la donnee. Une ligne sans marge brute publiee -- Visa,
//  qui ne declare aucun cout des ventes -- ne tire pas la moyenne vers
//  le bas : elle en sort, et la couverture est affichee pour qu'on sache
//  sur quelle part du portefeuille l'agregat porte.
//
//  Un ratio de valorisation se pondere par la valeur, jamais par le
//  nombre de lignes : une position de 1 % ne doit pas peser autant qu'une
//  position de 30 % dans le PER du portefeuille.
// =====================================================================

import { Doc, rendre } from "./qs-doc.js";

// Palette : la meme famille que les graphiques, en plus sourd -- une
// fiche s'imprime, et douze aplats satures la rendent illisible.
export const PALETTE = [
  "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2",
  "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#a16207",
];
const GRIS = "rgb(120,124,132)";
const NOIR = "#141414";
const BORD = "rgb(214,218,224)";

// ---------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------
export function montant(v, devise = "USD", decimales = null) {
  if (v == null || !isFinite(v)) return "—";
  const signe = v < 0 ? "−" : "";
  const a = Math.abs(v);
  const [n, u] = a >= 1e12 ? [a / 1e12, "T"] : a >= 1e9 ? [a / 1e9, "B"]
    : a >= 1e6 ? [a / 1e6, "M"] : a >= 1e3 ? [a / 1e3, "k"] : [a, ""];
  const sym = devise === "USD" ? "$" : devise === "EUR" ? "€" : `${devise} `;
  const d = decimales ?? (n >= 100 || !u ? 0 : 1);
  return `${signe}${sym}${n.toFixed(d)}${u}`;
}

const pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(d)} %`);

/**
 * Moyenne ponderee, renormalisee sur les lignes qui ont la donnee.
 * @returns {{valeur, couverture}} couverture = part du portefeuille retenue
 */
export function pondere(lignes, champ) {
  let somme = 0, poids = 0, total = 0;
  for (const l of lignes) {
    total += l.poids;
    const v = l[champ];
    if (v == null || !isFinite(v)) continue;
    somme += v * l.poids;
    poids += l.poids;
  }
  return poids > 0
    ? { valeur: somme / poids, couverture: total > 0 ? poids / total : 0 }
    : { valeur: null, couverture: 0 };
}

/** Regroupe les lignes par cle et cumule les poids. */
export function grouper(lignes, champ, inconnu = "Unknown") {
  const m = new Map();
  for (const l of lignes) {
    const k = l[champ] || inconnu;
    m.set(k, (m.get(k) || 0) + l.poids);
  }
  return [...m.entries()]
    .map(([nom, poids]) => ({ nom, poids }))
    .sort((a, b) => b.poids - a.poids);
}

/** Tranches de capitalisation, bornes usuelles du marche americain. */
export const TRANCHES_CAP = [
  ["Mega  > $200B", (c) => c >= 200e9],
  ["Large $10-200B", (c) => c >= 10e9 && c < 200e9],
  ["Mid   $2-10B", (c) => c >= 2e9 && c < 10e9],
  ["Small < $2B", (c) => c < 2e9],
];

export function parCapitalisation(lignes) {
  const res = TRANCHES_CAP.map(([nom]) => ({ nom, poids: 0 }));
  let inconnu = 0;
  for (const l of lignes) {
    if (l.capitalisation == null || !isFinite(l.capitalisation)) { inconnu += l.poids; continue; }
    const i = TRANCHES_CAP.findIndex(([, test]) => test(l.capitalisation));
    if (i >= 0) res[i].poids += l.poids;
  }
  if (inconnu > 0) res.push({ nom: "Unknown", poids: inconnu });
  return res.filter((x) => x.poids > 0);
}

// ---------------------------------------------------------------------
// Blocs de dessin
// ---------------------------------------------------------------------
function titreBloc(doc, x, y, w, texte, note = "") {
  doc.police(9, true).texteCouleur(NOIR);
  doc.texteDans(x, y, w, 5, texte, "L", 0);
  if (note) {
    doc.police(7).texteCouleur(GRIS);
    doc.texteDans(x, y, w, 5, note, "R", 0);
  }
  doc.traitCouleur(BORD).ligne(x, y + 5.2, x + w, y + 5.2, { epaisseur: 0.3 });
  doc.police(8).texteCouleur(NOIR);
}

/**
 * Camembert + legende. La legende est a DROITE et non sous le graphe :
 * douze libelles empiles verticalement tiennent dans la hauteur d'un
 * camembert, alors qu'en dessous ils doubleraient la hauteur du bloc.
 */
function camembert(doc, x, y, w, h, parts, { anneau = true } = {}) {
  const total = parts.reduce((a, p) => a + p.poids, 0);
  if (total <= 0) return;
  const r = Math.min(h, w * 0.42) / 2 - 1;
  const cx = x + r + 2, cy = y + h / 2;

  let angle = 0;
  parts.forEach((p, i) => {
    const delta = (p.poids / total) * Math.PI * 2;
    doc.fondCouleur(PALETTE[i % PALETTE.length]);
    doc.part(cx, cy, r, angle, angle + delta, { rayonInterne: anneau ? r * 0.55 : 0 });
    angle += delta;
  });

  //  Au centre de l'anneau, le nombre de lignes : l'espace est libre et
  //  l'information manquerait ailleurs.
  if (anneau) {
    doc.police(11, true).texteCouleur(NOIR);
    doc.texteDans(cx - r, cy - 3.4, r * 2, 4, String(parts.length), "C", 0);
    doc.police(6).texteCouleur(GRIS);
    doc.texteDans(cx - r, cy + 0.6, r * 2, 3, "groups", "C", 0);
  }

  const lx = cx + r + 5;
  const lw = x + w - lx;
  const pas = Math.min(4.4, h / Math.max(parts.length, 1));
  let ly = cy - (parts.length * pas) / 2 + pas / 2;
  parts.forEach((p, i) => {
    doc.fondCouleur(PALETTE[i % PALETTE.length]);
    doc.disque(lx + 1.2, ly + 0.1, 1.1);
    doc.police(7).texteCouleur(NOIR);
    doc.texteDans(lx + 3.4, ly - 2, lw - 16, 4, p.nom, "L", 0);
    doc.police(7, true).texteCouleur(NOIR);
    doc.texteDans(lx + lw - 14, ly - 2, 14, 4, `${(p.poids / total * 100).toFixed(1)} %`, "R", 0);
    ly += pas;
  });
}

/** Barres horizontales, pour la geographie et les tranches de capitalisation. */
function barres(doc, x, y, w, h, parts, couleur = PALETTE[0]) {
  const total = parts.reduce((a, p) => a + p.poids, 0);
  if (total <= 0) return y;
  const pas = Math.min(6.5, h / parts.length);
  const largeurLibelle = 30;
  const largeurValeur = 14;
  let ly = y;
  for (const p of parts) {
    const part = p.poids / total;
    doc.police(7).texteCouleur(NOIR);
    doc.texteDans(x, ly, largeurLibelle, pas, p.nom, "L", 0);
    const bx = x + largeurLibelle + 1;
    const bw = w - largeurLibelle - largeurValeur - 2;
    doc.fondCouleur("rgb(238,241,245)").rect(bx, ly + pas * 0.22, bw, pas * 0.56, { fill: true });
    doc.fondCouleur(couleur).rect(bx, ly + pas * 0.22, bw * part, pas * 0.56, { fill: true });
    doc.police(7, true);
    doc.texteDans(x + w - largeurValeur, ly, largeurValeur, pas, `${(part * 100).toFixed(1)} %`, "R", 0);
    ly += pas;
  }
  //  Renvoie la hauteur REELLEMENT occupee : trois pays et quatre tranches
  //  de capitalisation ne remplissent pas la meme place, et reserver la
  //  hauteur maximale laissait un vide de deux centimetres au milieu de la
  //  page.
  return ly;
}

/** Tableau simple libelle / valeur, sur deux colonnes de paires. */
function grilleChiffres(doc, x, y, w, entrees, colonnes = 2) {
  const lignesParCol = Math.ceil(entrees.length / colonnes);
  const cw = w / colonnes;
  entrees.forEach((e, i) => {
    const col = Math.floor(i / lignesParCol);
    const rang = i % lignesParCol;
    const ex = x + col * cw;
    const ey = y + rang * 5.6;
    doc.police(7).texteCouleur(GRIS);
    doc.texteDans(ex, ey, cw - 22, 5.2, e.nom, "L", 0);
    doc.police(8.5, true).texteCouleur(e.couleur || NOIR);
    doc.texteDans(ex + cw - 24, ey, 22, 5.2, e.valeur, "R", 0);
    if (e.note) {
      doc.police(6).texteCouleur("rgb(160,164,172)");
      doc.texteDans(ex + cw - 24, ey + 3.4, 22, 3, e.note, "R", 0);
    }
  });
  return y + lignesParCol * 5.6;
}

// ---------------------------------------------------------------------
// Fiche complete
// ---------------------------------------------------------------------
/**
 * @param {Array} lignes  positions enrichies : {ticker, nom, poids, valeur,
 *   secteur, pays, capitalisation, prix, cout, perf, per, marge_brute, ...}
 * @param {Object} meta   {devise, total, cout, titre, dateCours}
 */
export function dessinerPortfolio(lignes, meta = {}, { echelle = 8 } = {}) {
  const devise = meta.devise || "USD";
  const A4 = 210;
  const marge = 10;

  const peindre = (doc) => {
    const W = doc.epw;
    const G = marge;

    // -- en-tete -------------------------------------------------------
    doc.police(15, true).texteCouleur(NOIR);
    doc.texteDans(G, doc.y, W * 0.6, 8, meta.titre || "Portfolio", "L", 0);
    doc.police(7.5).texteCouleur(GRIS);
    doc.texteDans(G + W * 0.6, doc.y + 1, W * 0.4, 6,
      `${new Date().toISOString().slice(0, 10)}${meta.dateCours ? `  ·  prices ${meta.dateCours}` : ""}`,
      "R", 0);
    doc.y += 9;

    //  Bandeau de synthese : ce qu'on veut savoir avant tout le reste.
    const perfTotale = meta.cout > 0 ? (meta.total / meta.cout - 1) * 100 : null;
    const synthese = [
      { nom: "Total value", valeur: montant(meta.total, devise) },
      { nom: "Positions", valeur: String(lignes.length) },
      { nom: "Largest", valeur: lignes.length ? `${lignes[0].ticker} ${(lignes[0].poids * 100).toFixed(1)} %` : "—" },
      { nom: "Top 5 weight", valeur: pct(lignes.slice(0, 5).reduce((a, l) => a + l.poids, 0) * 100) },
    ];
    if (perfTotale != null) {
      synthese.push({
        nom: "Total return", valeur: pct(perfTotale),
        couleur: perfTotale >= 0 ? "rgb(5,120,85)" : "rgb(190,30,30)",
        note: `cost ${montant(meta.cout, devise)}`,
      });
    }
    doc.fondCouleur("rgb(248,250,252)").traitCouleur(BORD);
    const hBandeau = 13;
    doc.rect(G, doc.y, W, hBandeau, { fill: true, border: true });
    const cw = W / synthese.length;
    synthese.forEach((e, i) => {
      doc.police(6.5).texteCouleur(GRIS);
      doc.texteDans(G + i * cw + 3, doc.y + 1.6, cw - 6, 3.5, e.nom.toUpperCase(), "L", 0);
      doc.police(11, true).texteCouleur(e.couleur || NOIR);
      doc.texteDans(G + i * cw + 3, doc.y + 5.4, cw - 6, 6, e.valeur, "L", 0);
      if (e.note) {
        doc.police(6).texteCouleur(GRIS);
        doc.texteDans(G + i * cw + 3, doc.y + 10.4, cw - 6, 3, e.note, "L", 0);
      }
    });
    doc.y += hBandeau + 6;

    // -- allocation + positions ---------------------------------------
    const colG = W * 0.46, colD = W - colG - 6;
    const yBloc = doc.y;

    titreBloc(doc, G, yBloc, colG, "Allocation", `${lignes.length} positions`);
    const partsPositions = lignes.slice(0, 11).map((l) => ({ nom: l.ticker, poids: l.poids }));
    const reste = lignes.slice(11).reduce((a, l) => a + l.poids, 0);
    if (reste > 0) partsPositions.push({ nom: `Other (${lignes.length - 11})`, poids: reste });
    camembert(doc, G, yBloc + 7, colG, 52, partsPositions);

    titreBloc(doc, G + colG + 6, yBloc, colD, "Sectors");
    camembert(doc, G + colG + 6, yBloc + 7, colD, 52, grouper(lignes, "secteur"));
    doc.y = yBloc + 62;

    // -- geographie + capitalisation ----------------------------------
    const y2 = doc.y;
    const pays = grouper(lignes, "pays");
    titreBloc(doc, G, y2, colG, "Geography", `${pays.length} ${pays.length === 1 ? "country" : "countries"}`);
    const basG = barres(doc, G, y2 + 8, colG, 34, pays.slice(0, 5), PALETTE[2]);

    titreBloc(doc, G + colG + 6, y2, colD, "Market cap");
    const basD = barres(doc, G + colG + 6, y2 + 8, colD, 34, parCapitalisation(lignes), PALETTE[4]);
    doc.y = Math.max(basG, basD) + 6;

    // -- financiers ponderes ------------------------------------------
    const y3 = doc.y;
    const champs = [
      ["Gross margin", "marge_brute", (v) => pct(v)],
      ["Operating margin", "marge_op", (v) => pct(v)],
      ["FCF margin", "marge_fcf", (v) => pct(v)],
      ["ROIC", "roic", (v) => pct(v)],
      ["Revenue growth 5y", "croissance", (v) => pct(v)],
      ["P/E", "per", (v) => (v == null ? "—" : v.toFixed(1))],
      ["FCF yield", "fcf_yield", (v) => pct(v, 2)],
      ["Net debt / FCF", "dette_fcf", (v) => (v == null ? "—" : `${v.toFixed(1)}x`)],
    ];
    const entrees = champs.map(([nom, champ, fmt]) => {
      const { valeur, couverture } = pondere(lignes, champ);
      return {
        nom, valeur: fmt(valeur),
        note: valeur == null ? "no data"
          : couverture < 0.995 ? `${Math.round(couverture * 100)} % of book` : "",
      };
    });
    titreBloc(doc, G, y3, W, "Weighted financials",
      "weighted by position size, renormalised over the lines that report each figure");
    doc.y = grilleChiffres(doc, G, y3 + 8, W, entrees, 4) + 4;

    // -- tableau des positions ----------------------------------------
    const y4 = doc.y;
    titreBloc(doc, G, y4, W, "Positions");
    let ty = y4 + 7;
    const cols = meta.cout > 0
      ? [["Ticker", 18, "L"], ["Company", 52, "L"], ["Sector", 30, "L"],
         ["Weight", 16, "R"], ["Value", 22, "R"], ["Cost", 22, "R"], ["Return", 20, "R"]]
      : [["Ticker", 20, "L"], ["Company", 66, "L"], ["Sector", 38, "L"],
         ["Weight", 20, "R"], ["Value", 26, "R"], ["Price", 20, "R"]];

    doc.fondCouleur("rgb(243,246,249)").rect(G, ty, W, 5.4, { fill: true });
    doc.police(6.5, true).texteCouleur(GRIS);
    let cx = G;
    for (const [lib, lw, al] of cols) { doc.texteDans(cx, ty, lw, 5.4, lib.toUpperCase(), al, 1.5); cx += lw; }
    ty += 5.4;

    for (const l of lignes) {
      doc.fondCouleur(lignes.indexOf(l) % 2 ? "rgb(250,251,253)" : "#ffffff");
      doc.rect(G, ty, W, 5, { fill: true });
      cx = G;
      const valeurs = meta.cout > 0
        ? [l.ticker, (l.nom || "").slice(0, 34), (l.secteur || "").slice(0, 20),
           pct(l.poids * 100), montant(l.valeur, devise), montant(l.cout, devise),
           l.perf == null ? "—" : pct(l.perf)]
        : [l.ticker, (l.nom || "").slice(0, 42), (l.secteur || "").slice(0, 26),
           pct(l.poids * 100), montant(l.valeur, devise),
           l.prix == null ? "—" : montant(l.prix, devise, 2)];
      valeurs.forEach((v, i) => {
        const [, lw, al] = cols[i];
        const estPerf = meta.cout > 0 && i === 6 && l.perf != null;
        doc.police(7, i === 0);
        doc.texteCouleur(estPerf ? (l.perf >= 0 ? "rgb(5,120,85)" : "rgb(190,30,30)") : NOIR);
        doc.texteDans(cx, ty, lw, 5, v, al, 1.5);
        cx += lw;
      });
      ty += 5;
    }
    doc.traitCouleur(BORD).ligne(G, ty, G + W, ty, { epaisseur: 0.3 });
    doc.y = ty + 4;

    // -- pied ----------------------------------------------------------
    doc.police(6.5).texteCouleur("rgb(150,154,162)");
    doc.multiCell(W, 3.4,
      "Fundamentals from XBRL filings with the SEC; prices from market quotes. Weighted "
      + "figures are renormalised over the positions that report each item, and the coverage "
      + "is shown whenever it is below 100 % of the book. Nothing here is estimated: a line "
      + "with no published figure is left out of the average rather than filled in.",
      { padding: 0 });
  };

  return rendre(peindre, { largeurMm: A4, marge, echelle, margeBas: 8 });
}
