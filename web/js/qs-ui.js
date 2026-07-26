// =====================================================================
//  Petits utilitaires d'interface partages par les deux pages
// =====================================================================

export const $ = (sel, racine = document) => racine.querySelector(sel);

/** Vide un conteneur. */
export function vider(el) { while (el.firstChild) el.removeChild(el.firstChild); }

/** Cree un element avec classe / texte / attributs. */
export function el(tag, { classe, texte, html, ...attrs } = {}, enfants = []) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  if (html !== undefined) n.innerHTML = html;
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(enfants)) if (c) n.appendChild(c);
  return n;
}

/** Affiche un bloc de message (erreur / info / ok). */
export function message(conteneur, type, texte, lignes = []) {
  const n = el("div", { classe: `message ${type}` }, []);
  n.appendChild(el("div", { texte }));
  if (lignes.length) {
    const ul = el("ul");
    for (const l of lignes) ul.appendChild(el("li", { texte: l }));
    n.appendChild(ul);
  }
  conteneur.appendChild(n);
  return n;
}

// ---------------------------------------------------------------------
// Telechargement / presse-papiers
// ---------------------------------------------------------------------
function declencher(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: nomFichier });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function telechargerCanvas(canvas, nomFichier) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => { declencher(blob, nomFichier); resolve(); }, "image/png");
  });
}

export function telechargerTexte(texte, nomFichier, type = "text/csv;charset=utf-8") {
  declencher(new Blob(["﻿" + texte], { type }), nomFichier);
}

/** Copie l'image dans le presse-papiers. Renvoie true si ca a marche. */
export async function copierCanvas(canvas) {
  if (!navigator.clipboard || !window.ClipboardItem) return false;
  try {
    const item = new ClipboardItem({
      "image/png": new Promise((resolve) => canvas.toBlob(resolve, "image/png")),
    });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// Bloc de resultat : apercu + barre d'actions
// ---------------------------------------------------------------------
/**
 * @param {HTMLCanvasElement} canvas
 * @param {{titre: string, nomFichier: string, extras?: HTMLElement[]}} o
 */
export function blocResultat(canvas, { titre, nomFichier, extras = [] }) {
  const section = el("section", { classe: "carte resultat" });

  const entete = el("div", { classe: "entete-resultat" });
  entete.appendChild(el("h2", { texte: titre }));
  entete.appendChild(el("span", { classe: "taille", texte: `${canvas.width} x ${canvas.height} px` }));
  section.appendChild(entete);

  const apercu = el("div", { classe: "apercu" });
  apercu.appendChild(canvas);
  section.appendChild(apercu);

  const actions = el("div", { classe: "ligne-actions" });
  const btnDl = el("button", { classe: "primaire", texte: "Download PNG" });
  btnDl.addEventListener("click", () => telechargerCanvas(canvas, nomFichier));
  actions.appendChild(btnDl);

  const btnCopie = el("button", { texte: "Copy image" });
  btnCopie.addEventListener("click", async () => {
    const ok = await copierCanvas(canvas);
    btnCopie.textContent = ok ? "Copied!" : "Copy blocked by the browser";
    setTimeout(() => { btnCopie.textContent = "Copy image"; }, 2200);
  });
  actions.appendChild(btnCopie);

  for (const e of extras) actions.appendChild(e);
  section.appendChild(actions);
  return section;
}

/** Bouton secondaire simple. */
export function bouton(texte, onClick) {
  const b = el("button", { texte });
  b.addEventListener("click", onClick);
  return b;
}

// ---------------------------------------------------------------------
// Indicateur d'activite
// ---------------------------------------------------------------------
export function statut(elStatut, elTexte) {
  return {
    montrer(texte) { elTexte.textContent = texte; elStatut.classList.remove("cache"); },
    cacher() { elStatut.classList.add("cache"); },
  };
}

// Laisse le navigateur repeindre avant un calcul lourd. On passe par
// setTimeout et non requestAnimationFrame : rAF ne se declenche pas quand
// l'onglet est en arriere-plan, ce qui figerait la generation.
export const respirer = () => new Promise((r) => setTimeout(r, 0));
