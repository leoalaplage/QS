/**
 * QS - Relais EDGAR (Cloudflare Worker)
 * =====================================
 * data.sec.gov ne renvoie pas d'en-tete Access-Control-Allow-Origin : un site
 * statique (GitHub Pages) ne peut donc pas l'appeler directement. Ce Worker
 * fait trois choses, et rien d'autre :
 *   1. ajoute le User-Agent avec contact exige par la SEC ;
 *   2. ajoute les en-tetes CORS qui manquent ;
 *   3. met les reponses en cache (elles ne bougent qu'une fois par trimestre).
 *
 * Routes :
 *   GET /facts/<CIK>   -> https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
 *   GET /tickers       -> https://www.sec.gov/files/company_tickers.json
 *   GET /              -> petit message de sante
 *
 * Deploiement : voir worker/README.md
 */

// La SEC exige un contact reel dans le User-Agent.
const CONTACT = "leoalaplage@gmail.com";
const USER_AGENT = `QS-Chart/1.0 (${CONTACT})`;

// Origines autorisees. "*" convient pour un site public en lecture seule ;
// mets-y l'URL de ta page GitHub pour restreindre.
const ORIGINES = "*";

const CACHE_SECONDES = 60 * 60 * 12;   // 12 h

const enTetesCors = {
  "Access-Control-Allow-Origin": ORIGINES,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (donnees, statut = 200) =>
  new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { "Content-Type": "application/json; charset=utf-8", ...enTetesCors },
  });

/** Recupere une URL SEC en passant par le cache du Worker. */
async function relayer(url, ctx) {
  const cache = caches.default;
  const cle = new Request(url, { method: "GET" });

  const enCache = await cache.match(cle);
  if (enCache) {
    const r = new Response(enCache.body, enCache);
    for (const [k, v] of Object.entries(enTetesCors)) r.headers.set(k, v);
    r.headers.set("X-QS-Cache", "hit");
    return r;
  }

  const amont = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cf: { cacheTtl: CACHE_SECONDES, cacheEverything: true },
  });

  if (!amont.ok) {
    return json(
      { erreur: `EDGAR a repondu ${amont.status}`, url },
      amont.status === 404 ? 404 : 502
    );
  }

  const reponse = new Response(amont.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDES}`,
      ...enTetesCors,
    },
  });
  ctx.waitUntil(cache.put(cle, reponse.clone()));
  return reponse;
}

export default {
  async fetch(requete, env, ctx) {
    if (requete.method === "OPTIONS") return new Response(null, { status: 204, headers: enTetesCors });
    if (requete.method !== "GET") return json({ erreur: "Methode non autorisee" }, 405);

    const chemin = new URL(requete.url).pathname.replace(/\/+$/, "");

    if (chemin === "" || chemin === "/") {
      return json({ service: "QS - relais EDGAR", routes: ["/facts/<CIK>", "/tickers"] });
    }

    if (chemin === "/tickers") {
      return relayer("https://www.sec.gov/files/company_tickers.json", ctx);
    }

    const m = chemin.match(/^\/facts\/(\d{1,10})$/);
    if (m) {
      const cik = String(Number(m[1])).padStart(10, "0");
      return relayer(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, ctx);
    }

    return json({ erreur: "Route inconnue", routes: ["/facts/<CIK>", "/tickers"] }, 404);
  },
};
