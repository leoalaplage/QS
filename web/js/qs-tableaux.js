// =====================================================================
//  QS - Lecture des TABLEAUX d'un depot SEC
//
//  POURQUOI PASSER PAR LA STRUCTURE ET NON PAR LE TEXTE
//  Aplati en texte, un tableau de depot devient illisible : les libelles
//  se detachent de leurs chiffres, et « Consumer debit » se retrouve sur
//  une ligne, ses six montants sur la suivante. Aucune expression
//  reguliere ne rattrape ca de facon fiable.
//
//  Lu comme un TABLEAU -- lignes, cellules -- tout redevient simple :
//  la premiere cellule porte le libelle, les suivantes les valeurs, dans
//  l'ordre des colonnes. C'est la seule facon d'extraire ces chiffres
//  sans se tromper de colonne un trimestre sur deux.
//
//  Les depots imposent trois precautions :
//    - le symbole monetaire et le signe pourcent occupent leurs PROPRES
//      cellules, de facon irreguliere -- on ne compte donc que les
//      cellules numeriques, jamais les positions brutes ;
//    - les libelles portent des appels de note « (2) », « (4),(6) » ;
//    - un tiret cadratin vaut zero, pas « valeur absente ».
// =====================================================================

/** Entites HTML rencontrees dans les depots, y compris sous forme brute. */
const ENTITES = {
  "&#160;": " ", "&nbsp;": " ", "&#38;": "&", "&amp;": "&",
  "&#8212;": "—", "&#8211;": "–", "&#8217;": "'", "&#8216;": "'",
  "&#8220;": '"', "&#8221;": '"', "&#34;": '"', "&quot;": '"',
  "&#39;": "'", "&#58;": ":", "&#47;": "/", "&#8226;": "*", "&#37;": "%",
};

export function decoderEntites(t) {
  let s = String(t);
  for (const [k, v] of Object.entries(ENTITES)) s = s.split(k).join(v);
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

const texteCellule = (html) => decoderEntites(String(html).replace(/<[^>]+>/g, " "))
  .replace(/\s+/g, " ").trim();

/**
 * Tous les tableaux d'un document.
 * @returns {Array<{index, texte, lignes: string[][]}>}
 */
export function analyserTableaux(html) {
  const bruts = String(html).match(/<table[\s\S]*?<\/table>/gi) || [];
  return bruts.map((t, index) => {
    const lignes = (t.match(/<tr[\s\S]*?<\/tr>/gi) || []).map((r) =>
      (r.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(texteCellule));
    return {
      index,
      texte: texteCellule(t),
      lignes: lignes.filter((c) => c.some((x) => x !== "")),
    };
  });
}

/** Retire les appels de note et la ponctuation de fin d'un libelle. */
export function normaliserLibelle(t) {
  return String(t)
    .replace(/\((\d+)\)(\s*,\s*\(\d+\))*/g, " ")   // (2), (4),(6)
    .replace(/[*†‡]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s:.,;]+$/, "")
    .trim();
}

//  Le nombre peut arriver colle a son symbole -- « 9% », « $4,981 » dans
//  les communiques -- ou separe de lui, une cellule par symbole, dans les
//  rapports trimestriels. On nettoie donc avant de tester.
const RE_NOMBRE = /^\(?-?[\d.,]+\)?$/;
const nettoyerNombre = (t) => String(t).replace(/[$%\s]/g, "");

/**
 * Valeurs numeriques d'une ligne, dans l'ordre.
 *
 * Les parentheses valent un signe negatif -- convention comptable
 * americaine -- et le tiret cadratin vaut zero : dans un tableau de
 * croissance, « — % » signifie une croissance nulle, pas une donnee
 * manquante.
 */
export function valeurs(cellules) {
  const out = [];
  for (let i = 0; i < cellules.length; i++) {
    const brut = String(cellules[i]).trim();
    if (brut === "—" || brut === "–" || brut === "-") { out.push(0); continue; }
    const t = nettoyerNombre(brut);
    if (!t || !RE_NOMBRE.test(t) || !/\d/.test(t)) continue;

    //  Une valeur negative peut etre coupee en deux cellules : « (2 » puis
    //  « %) ». Prise isolement, la premiere passerait pour un +2 -- une
    //  croissance de -2 % deviendrait +2 %. On regarde donc la cellule
    //  suivante pour retrouver la parenthese fermante.
    let negatif = t.startsWith("(") && t.endsWith(")");
    if (!negatif && t.startsWith("(")) {
      const suivant = String(cellules[i + 1] || "");
      if (suivant.includes(")")) negatif = true;
    }
    const v = parseFloat(t.replace(/[(),]/g, ""));
    if (isFinite(v)) out.push(negatif ? -v : v);
  }
  return out;
}

/** Premiere cellule non vide et non numerique : le libelle de la ligne. */
export function libelleDe(cellules) {
  for (const c of cellules) {
    const t = String(c).trim();
    if (!t || t === "$" || t === "%") continue;
    if (RE_NOMBRE.test(t) && /\d/.test(t)) return null;   // ligne sans libelle
    return normaliserLibelle(t);
  }
  return null;
}

// ---------------------------------------------------------------------
// Periode
// ---------------------------------------------------------------------
const MOIS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Periode couverte par un tableau, lue DANS le tableau.
 *
 * C'est le point le plus important de tout ce module. Visa publie ses
 * volumes avec un trimestre de retard : son rapport arrete au 31 mars
 * contient les volumes des trois mois clos le 31 DECEMBRE. Dater les
 * chiffres d'apres le depot les decalerait tous d'un trimestre, sans que
 * rien ne le signale. L'en-tete du tableau, lui, dit exactement ce qu'il
 * couvre.
 *
 * @returns {string|null} « 2025Q4 »
 */
export function periodeDuTableau(texte) {
  //  Entre l'intitule et le millesime peuvent s'intercaler un appel de
  //  note et l'en-tete de la colonne voisine : « Three Months Ended March
  //  31, Six Months Ended March 31, 2026 2025 ». On tolere donc du texte,
  //  mais pas de chiffre a quatre positions -- le premier millesime
  //  rencontre est celui de la periode courante.
  const m = /Three Months Ended\s+([A-Za-z]+)\s+(\d{1,2})\s*,?((?:[^\d]|\d{1,3}(?!\d))*?)(\d{4})/i.exec(texte);
  if (m) {
    const mois = MOIS[m[1].toLowerCase()];
    if (mois) return `${m[4]}Q${Math.ceil(mois / 3)}`;
  }
  //  Le rapport annuel presente les memes tableaux sur DOUZE mois. On les
  //  marque d'un « A » : ils ne sont pas un trimestre, mais ils permettent
  //  de reconstituer celui qui manque -- Visa ne publie que trois
  //  trimestres de volumes par exercice, le quatrieme n'existant que
  //  fondu dans l'annuel.
  //  Deux formulations pour la meme chose selon le tableau : le rapport
  //  annuel de Visa ecrit « Twelve Months Ended June 30 » pour les
  //  volumes et « Years Ended September 30 » pour le chiffre d'affaires.
  const a = /(?:Twelve Months|Years?) Ended\s+([A-Za-z]+)\s+(\d{1,2})\s*,?((?:[^\d]|\d{1,3}(?!\d))*?)(\d{4})/i.exec(texte);
  if (a) {
    const mois = MOIS[a[1].toLowerCase()];
    if (mois) return `A${a[4]}Q${Math.ceil(mois / 3)}`;
  }

  //  Forme abregee des communiques : « Q2 2026 » designe un trimestre
  //  FISCAL, qu'on ne peut pas convertir sans connaitre la cloture de
  //  l'exercice. On ne devine pas : on renvoie null et l'appelant se
  //  rabat sur une periode lue ailleurs.
  return null;
}
