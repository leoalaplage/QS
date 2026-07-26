// =====================================================================
//  Reglages du site
// =====================================================================
//
//  EDGAR (data.sec.gov) ne renvoie PAS d'en-tete Access-Control-Allow-Origin :
//  un site statique ne peut donc pas l'appeler directement, le navigateur
//  bloque la reponse. Le petit Worker Cloudflare du dossier `worker/` sert
//  de relais : il ajoute le User-Agent exige par la SEC et les en-tetes CORS.
//
//  >>> Colle ici l'URL de TON worker apres deploiement, par exemple :
//      export const WORKER_URL = "https://qs-edgar.leo.workers.dev";
//
//  Tant que c'est vide, la page Chart propose de saisir l'URL a la main
//  (elle est alors memorisee dans le navigateur).
// =====================================================================

export const WORKER_URL_DEFAUT = "https://qs-edgar.leoalaplage.workers.dev";

const CLE_STOCKAGE = "qs.worker.url";

export function workerUrl() {
  const perso = (localStorage.getItem(CLE_STOCKAGE) || "").trim();
  return (perso || WORKER_URL_DEFAUT).replace(/\/+$/, "");
}

export function definirWorkerUrl(url) {
  const propre = (url || "").trim().replace(/\/+$/, "");
  if (propre) localStorage.setItem(CLE_STOCKAGE, propre);
  else localStorage.removeItem(CLE_STOCKAGE);
  return propre;
}

/** Duree affichee par defaut sur la page Chart (annees). */
export const ANNEES_DEFAUT = 15;

/** Resolution des PNG exportes : pixels par millimetre (8 ~ 200 dpi). */
export const ECHELLE_PNG = 8;
