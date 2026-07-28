// =====================================================================
//  QS - Regularite du flux de tresorerie libre
//
//  Trois mesures, sur des fenetres de 3 a 15 exercices :
//
//  CAGR      croissance annuelle moyenne du FCF, d'un bout a l'autre de
//            la fenetre.
//  R²        a quel point cette croissance est REGULIERE. On ajuste une
//            droite sur le logarithme du FCF : si la societe croit a un
//            rythme constant, les points s'alignent et le R² approche 1.
//            Une croissance identique obtenue par a-coups donne le meme
//            CAGR et un R² bien plus bas. C'est toute la difference entre
//            un compounder et une societe cyclique.
//  CV        coefficient de variation du rendement du FCF (ecart-type
//            divise par la moyenne). Il ne mesure pas l'entreprise mais
//            ce que le marche en a paye : un CV faible signale un titre
//            constamment valorise de la meme facon, un CV eleve des
//            phases d'engouement et de defiance.
//
//  POURQUOI LE LOGARITHME
//  Une croissance composee est une exponentielle. Ajuster une droite
//  directement sur le FCF donnerait un R² mediocre a une societe pourtant
//  parfaitement reguliere, simplement parce qu'une exponentielle n'est
//  pas une droite. Le logarithme la redresse : R² = 1 signifie « croit
//  exactement au meme taux chaque annee ».
//
//  CE QUI EST REFUSE PLUTOT QU'APPROXIME
//  Un FCF negatif n'a pas de logarithme, et un CAGR entre deux valeurs de
//  signes opposes n'a aucun sens. Ces fenetres ne renvoient pas un chiffre
//  douteux : elles renvoient null, avec la raison.
// =====================================================================


import { decoderCle } from "./qs-chart-edgar.js";

/** Fenetres proposees, en annees. */
export const FENETRES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** Nombre de points par an selon le mode d'observation. */
export const PAR_AN = { annuel: 1, trimestre: 4, ttm: 4 };

/**
 * Les points d'une serie couvrant les `nbAnnees` dernieres annees.
 *
 * Chaque cle est ramenee a une ANNEE DECIMALE, positionnee a la fin de sa
 * periode -- c'est deja la convention du reste du site. Un exercice 2025
 * vaut 2026,0 et un trimestre 2025Q3 vaut 2025,75. Tout le calcul se fait
 * ensuite sur cet axe continu, ce qui rend le mode d'observation
 * indifferent : un CAGR reste un taux ANNUEL, qu'il soit tire de quinze
 * points annuels ou de soixante points trimestriels.
 *
 * La continuite est exigee : un trou fausserait autant le taux de
 * croissance que la regression, sans que rien ne le signale a l'ecran.
 */
export function derniersPoints(serie, nbAnnees, parAn = 1) {
  const pts = Object.keys(serie)
    .map((k) => ({ cle: k, x: decoderCle(k).x, val: serie[k] }))
    .filter((p) => Number.isFinite(p.x) && p.val != null && isFinite(p.val))
    .sort((a, b) => a.x - b.x);

  const attendus = Math.round(nbAnnees * parAn);
  if (pts.length < attendus) return null;
  const retenus = pts.slice(-attendus);

  const pas = 1 / parAn;
  for (let i = 1; i < retenus.length; i++) {
    if (Math.abs((retenus[i].x - retenus[i - 1].x) - pas) > pas * 0.35) return null;
  }
  return retenus;
}

/**
 * Regression des moindres carres de ln(valeur) sur l'annee decimale.
 * @returns {{croissance, r2, n}|null} croissance = taux ANNUEL implicite
 */
export function regressionLog(points) {
  if (!points || points.length < 3) return null;
  if (points.some((p) => p.val <= 0)) return null;          // pas de logarithme

  const n = points.length;
  const t = points.map((p) => p.x);
  const y = points.map((p) => Math.log(p.val));
  const tBar = t.reduce((a, b) => a + b, 0) / n;
  const yBar = y.reduce((a, b) => a + b, 0) / n;

  let stt = 0, sty = 0;
  for (let i = 0; i < n; i++) { stt += (t[i] - tBar) ** 2; sty += (t[i] - tBar) * (y[i] - yBar); }
  if (stt === 0) return null;
  const pente = sty / stt;
  const ordonnee = yBar - pente * tBar;

  //  R² = 1 - somme des carres residuels / somme des carres totale
  let sr = 0, st = 0;
  for (let i = 0; i < n; i++) {
    sr += (y[i] - (ordonnee + pente * t[i])) ** 2;
    st += (y[i] - yBar) ** 2;
  }
  //  Une serie parfaitement plate a une variance totale nulle : elle est
  //  aussi reguliere que possible, et son R² vaut 1 par convention.
  const r2 = st === 0 ? 1 : Math.max(0, 1 - sr / st);
  return { croissance: Math.exp(pente) - 1, r2, n };
}

/**
 * Taux de croissance annuel compose, du premier au dernier point.
 *
 * L'exposant est la duree REELLE en annees separant les deux bornes, et non
 * un nombre de points : c'est ce qui permet a un CAGR trimestriel de rester
 * comparable a un CAGR annuel.
 *
 * Refuse si l'une des deux bornes n'est pas strictement positive : passer de
 * -50 a +100 n'est pas une croissance de 241 % par an, c'est un
 * retournement, et aucun taux ne le decrit.
 */
export function cagr(points) {
  if (!points || points.length < 2) return null;
  const a = points[0], b = points[points.length - 1];
  const duree = b.x - a.x;
  if (duree <= 0 || a.val <= 0 || b.val <= 0) return null;
  return (b.val / a.val) ** (1 / duree) - 1;
}

/**
 * Coefficient de variation : ecart-type divise par la moyenne.
 * Ecart-type d'ECHANTILLON (division par n-1) : les periodes observees sont
 * un echantillon de l'histoire de la societe, pas sa population.
 */
export function coefficientVariation(valeurs) {
  const v = valeurs.filter((x) => x != null && isFinite(x));
  if (v.length < 3) return null;
  const moyenne = v.reduce((a, b) => a + b, 0) / v.length;
  if (moyenne <= 0) return null;            // un CV sur moyenne negative n'a pas de sens
  const variance = v.reduce((a, x) => a + (x - moyenne) ** 2, 0) / (v.length - 1);
  return { cv: Math.sqrt(variance) / moyenne, moyenne, n: v.length };
}

/**
 * Une fenetre, pour une societe.
 *
 * @param {Object} fcf   {cle: FCF}
 * @param {Object} rende {cle: rendement du FCF en %}
 */
export function fenetre(fcf, rende, nbAnnees, parAn = 1) {
  const pts = derniersPoints(fcf, nbAnnees, parAn);
  if (!pts) {
    //  Dire POURQUOI la ligne est vide. Nvidia n'a taggue aucune depense
    //  d'investissement entre 2013 et 2021 : son FCF ne peut pas former dix
    //  exercices consecutifs, et une ligne de tirets sans explication
    //  passerait pour une panne du site.
    return { annees: nbAnnees, cagr: null, r2: null, cv: null,
      refus: `needs ${Math.round(nbAnnees * parAn)} consecutive periods of free cash flow; `
        + "the filings do not provide them without a gap" };
  }

  const reg = regressionLog(pts);
  const ptsRende = derniersPoints(rende, nbAnnees, parAn);
  const stat = ptsRende ? coefficientVariation(ptsRende.map((p) => p.val)) : null;

  return {
    annees: nbAnnees,
    periode: `${pts[0].cle} → ${pts[pts.length - 1].cle}`,
    n: pts.length,
    cagr: cagr(pts),
    r2: reg ? reg.r2 : null,
    croissanceAjustee: reg ? reg.croissance : null,
    cv: stat ? stat.cv : null,
    moyenneRendement: stat ? stat.moyenne : null,
    negatif: pts.some((p) => p.val <= 0),
    //  Les periodes qui empechent la regression, nommees. Une case vide
    //  qui n'explique pas ce qui la vide passe pour une panne.
    negatifs: pts.filter((p) => p.val <= 0).map((p) => ({ cle: p.cle, val: p.val })),
    dernier: pts[pts.length - 1],
    valeurs: pts,
  };
}

/** Le tableau complet d'une societe : une ligne par fenetre. */
export function analyser(fcf, rende, fenetres = FENETRES, parAn = 1) {
  return fenetres.map((n) => fenetre(fcf, rende, n, parAn));
}
