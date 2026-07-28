// =====================================================================
//  Mini moteur de mise en page "type FPDF" sur <canvas>
//  On raisonne en MILLIMETRES (comme qs_pdf.py) et on convertit en pixels
//  au dernier moment. Deux passes : une passe "mesure" (draw = false) qui
//  calcule la hauteur exacte du document, puis une passe de dessin sur un
//  canvas a la bonne taille.
// =====================================================================

export const PT_EN_MM = 25.4 / 72;   // 1 point typographique = 0.3528 mm
export const POLICE = "Helvetica, Arial, 'Helvetica Neue', sans-serif";

/** Contexte de mesure partage (jamais affiche). */
let ctxMesure = null;
function contexteMesure() {
  if (!ctxMesure) ctxMesure = document.createElement("canvas").getContext("2d");
  return ctxMesure;
}

export class Doc {
  /**
   * @param {number} largeurMm  largeur totale de la page
   * @param {number} marge      marge gauche/droite en mm
   * @param {number} echelle    pixels par mm (8 = ~203 dpi)
   * @param {CanvasRenderingContext2D|null} ctx  null = passe de mesure
   */
  constructor(largeurMm, marge, echelle, ctx = null) {
    this.largeurMm = largeurMm;
    this.marge = marge;
    this.echelle = echelle;
    this.dessine = ctx !== null;
    this.ctx = ctx || contexteMesure();
    this.x = marge;
    this.y = marge;
    this.epw = largeurMm - 2 * marge;
    this._police = { pt: 10, gras: false };
    this.couleurTexte = "#141414";
    this.couleurFond = "#ffffff";
    this.couleurTrait = "rgb(210,214,220)";
    this.epaisseurTrait = 0.2;
  }

  // -- conversions -----------------------------------------------------
  px(mm) { return mm * this.echelle; }

  // -- etat graphique --------------------------------------------------
  police(pt, gras = false) {
    this._police = { pt, gras };
    this.ctx.font = `${gras ? "bold " : ""}${this.px(pt * PT_EN_MM)}px ${POLICE}`;
    return this;
  }
  texteCouleur(c) { this.couleurTexte = c; return this; }
  fondCouleur(c) { this.couleurFond = c; return this; }
  traitCouleur(c) { this.couleurTrait = c; return this; }

  /** Largeur d'une chaine, en mm, avec la police courante. */
  largeurTexte(s) {
    this.ctx.font = `${this._police.gras ? "bold " : ""}${this.px(this._police.pt * PT_EN_MM)}px ${POLICE}`;
    return this.ctx.measureText(String(s)).width / this.echelle;
  }

  // -- primitives ------------------------------------------------------
  rect(x, y, w, h, { fill = false, border = false } = {}) {
    if (!this.dessine) return;
    const c = this.ctx;
    if (fill) {
      c.fillStyle = this.couleurFond;
      c.fillRect(this.px(x), this.px(y), this.px(w), this.px(h));
    }
    if (border) {
      c.strokeStyle = this.couleurTrait;
      c.lineWidth = this.px(this.epaisseurTrait);
      // decalage d'un demi-pixel : traits nets, pas de flou
      c.strokeRect(this.px(x), this.px(y), this.px(w), this.px(h));
    }
  }

  /**
   * Part de camembert, angles en RADIANS, zero a midi et sens horaire.
   *
   * Un camembert se lit depuis midi : c'est la convention de tous les
   * rapports financiers, et l'oeil y cherche la plus grosse part en
   * premier. L'API du canevas, elle, part de trois heures -- d'ou le
   * quart de tour retire ici plutot qu'a chaque appel.
   */
  part(cx, cy, rayon, debut, fin, { rayonInterne = 0 } = {}) {
    if (!this.dessine) return;
    const c = this.ctx;
    const a0 = debut - Math.PI / 2, a1 = fin - Math.PI / 2;
    c.beginPath();
    if (rayonInterne > 0) {
      c.arc(this.px(cx), this.px(cy), this.px(rayon), a0, a1);
      c.arc(this.px(cx), this.px(cy), this.px(rayonInterne), a1, a0, true);
    } else {
      c.moveTo(this.px(cx), this.px(cy));
      c.arc(this.px(cx), this.px(cy), this.px(rayon), a0, a1);
    }
    c.closePath();
    c.fillStyle = this.couleurFond;
    c.fill();
    c.strokeStyle = "#ffffff";
    c.lineWidth = this.px(0.35);
    c.stroke();
  }

  /** Disque plein, pour les pastilles de legende. */
  disque(cx, cy, rayon) {
    if (!this.dessine) return;
    const c = this.ctx;
    c.beginPath();
    c.arc(this.px(cx), this.px(cy), this.px(rayon), 0, Math.PI * 2);
    c.fillStyle = this.couleurFond;
    c.fill();
  }

  ligne(x1, y1, x2, y2, { couleur = null, epaisseur = null } = {}) {
    if (!this.dessine) return;
    const c = this.ctx;
    c.strokeStyle = couleur || this.couleurTrait;
    c.lineWidth = this.px(epaisseur ?? this.epaisseurTrait);
    c.beginPath();
    c.moveTo(this.px(x1), this.px(y1));
    c.lineTo(this.px(x2), this.px(y2));
    c.stroke();
  }

  /** Texte place dans une boite, aligne L / C / R, centre verticalement. */
  texteDans(x, y, w, h, texte, align = "L", padding = 1.2) {
    if (!this.dessine || texte === "" || texte === null || texte === undefined) return;
    const c = this.ctx;
    c.fillStyle = this.couleurTexte;
    c.textBaseline = "middle";
    let tx;
    if (align === "C") { c.textAlign = "center"; tx = x + w / 2; }
    else if (align === "R") { c.textAlign = "right"; tx = x + w - padding; }
    else { c.textAlign = "left"; tx = x + padding; }
    c.fillText(String(texte), this.px(tx), this.px(y + h / 2));
    c.textAlign = "left";
  }

  /**
   * Cellule facon FPDF : dessine le fond, la bordure et le texte, puis
   * avance le curseur horizontalement.
   */
  cell(w, h, texte = "", { align = "L", fill = false, border = false, padding = 1.2 } = {}) {
    this.rect(this.x, this.y, w, h, { fill, border });
    this.texteDans(this.x, this.y, w, h, texte, align, padding);
    this.x += w;
    return this;
  }

  /** Retour a la ligne : curseur a la marge, descente de h. */
  ln(h = 0) { this.x = this.marge; this.y += h; return this; }

  /** Decoupe un texte en lignes qui tiennent dans w (mm). */
  decouper(texte, w, padding = 1.2) {
    const dispo = w - 2 * padding;
    const lignes = [];
    for (const paragraphe of String(texte).split("\n")) {
      const mots = paragraphe.split(/\s+/).filter(Boolean);
      if (!mots.length) { lignes.push(""); continue; }
      let courante = mots[0];
      for (const mot of mots.slice(1)) {
        if (this.largeurTexte(courante + " " + mot) <= dispo) courante += " " + mot;
        else { lignes.push(courante); courante = mot; }
      }
      lignes.push(courante);
    }
    return lignes;
  }

  /** Bloc de texte multi-lignes. Renvoie la hauteur consommee (mm). */
  multiCell(w, h, texte, { align = "L", padding = 1.2 } = {}) {
    const lignes = this.decouper(texte, w, padding);
    for (const l of lignes) {
      this.texteDans(this.marge, this.y, w, h, l, align, padding);
      this.y += h;
    }
    this.x = this.marge;
    return lignes.length * h;
  }
}

/**
 * Rend un document en deux passes et renvoie le canvas final.
 * @param {(doc: Doc) => void} peindre  fonction de dessin
 */
export function rendre(peindre, { largeurMm, marge = 10, echelle = 8, margeBas = 8 }) {
  // passe 1 : mesure
  const mesure = new Doc(largeurMm, marge, echelle, null);
  peindre(mesure);
  const hauteurMm = mesure.y + margeBas;

  // passe 2 : dessin
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(largeurMm * echelle);
  canvas.height = Math.ceil(hauteurMm * echelle);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "middle";
  const doc = new Doc(largeurMm, marge, echelle, ctx);
  peindre(doc);
  return canvas;
}
