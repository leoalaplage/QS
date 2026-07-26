// =====================================================================
//  Persistance locale
//  Le site est statique et sans compte : l'etat vit dans localStorage,
//  ce qui suffit a ne rien perdre en passant de Table a Chart et
//  inversement, ou en rechargeant la page.
//
//  On ne stocke que des reglages et des donnees deja saisies par
//  l'utilisateur -- rien ne part sur un serveur.
// =====================================================================

const PREFIXE = "qs.etat.";
const VERSION = 1;

/**
 * Lit un etat sauvegarde. Renvoie `defaut` si rien n'est stocke, si le
 * contenu est illisible, ou s'il vient d'une version anterieure du format :
 * mieux vaut repartir propre qu'appliquer un etat a moitie compris.
 */
export function lireEtat(cle, defaut = {}) {
  try {
    const brut = localStorage.getItem(PREFIXE + cle);
    if (!brut) return { ...defaut };
    const paquet = JSON.parse(brut);
    if (paquet.v !== VERSION) return { ...defaut };
    return { ...defaut, ...paquet.d };
  } catch {
    return { ...defaut };
  }
}

/** Ecrit un etat. Silencieux si le stockage est plein ou refuse. */
export function ecrireEtat(cle, donnees) {
  try {
    localStorage.setItem(PREFIXE + cle, JSON.stringify({ v: VERSION, d: donnees }));
  } catch { /* navigation privee, quota : l'appli marche sans */ }
}

export function effacerEtat(cle) {
  try { localStorage.removeItem(PREFIXE + cle); } catch { /* ignore */ }
}

/**
 * Enregistre au fil de l'eau, sans marteler le stockage a chaque frappe.
 * @returns {() => void} a appeler apres toute modification de l'etat
 */
export function sauvegardeDifferee(cle, collecter, delai = 400) {
  let minuteur = null;
  const enregistrer = () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => ecrireEtat(cle, collecter()), delai);
  };
  // filet de securite : on n'attend pas le delai si l'onglet se ferme
  window.addEventListener("pagehide", () => ecrireEtat(cle, collecter()));
  return enregistrer;
}
