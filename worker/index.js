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
async function relayer(url, ctx, estJson = true) {
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
    headers: { "User-Agent": USER_AGENT, Accept: estJson ? "application/json" : "text/html,*/*" },
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
      "Content-Type": estJson
        ? "application/json; charset=utf-8"
        : (amont.headers.get("Content-Type") || "text/html; charset=utf-8"),
      "Cache-Control": `public, max-age=${CACHE_SECONDES}`,
      ...enTetesCors,
    },
  });
  ctx.waitUntil(cache.put(cle, reponse.clone()));
  return reponse;
}

/**
 * Cours historiques, normalises en {devise, points:[{t, cloture}]}.
 * Une seule forme de sortie quel que soit le fournisseur : le site n'a pas
 * a savoir d'ou vient le prix.
 */
async function relayerPrix(symbole, plage, pas, env, ctx) {
  const cle = env && env.CLE_PRIX;
  const fournisseur = (env && env.FOURNISSEUR_PRIX) || (cle ? "twelvedata" : "yahoo");

  let url, entetes = { "User-Agent": USER_AGENT };
  if (fournisseur === "twelvedata") {
    const taille = { "1d": 5000, "1wk": 800, "1mo": 240 }[pas] || 240;
    const inter = { "1d": "1day", "1wk": "1week", "1mo": "1month" }[pas] || "1month";
    url = `https://api.twelvedata.com/time_series?symbol=${symbole}&interval=${inter}`
      + `&outputsize=${taille}&apikey=${cle}`;
  } else {
    url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbole}`
      + `?range=${plage}&interval=${pas}`;
    entetes = { "User-Agent": "Mozilla/5.0 (compatible; QS-Chart)" };
  }

  const cache = caches.default;
  const cleCache = new Request(`https://prix.local/${fournisseur}/${symbole}/${plage}/${pas}`);
  const enCache = await cache.match(cleCache);
  if (enCache) {
    const r = new Response(enCache.body, enCache);
    for (const [k, v] of Object.entries(enTetesCors)) r.headers.set(k, v);
    r.headers.set("X-QS-Cache", "hit");
    return r;
  }

  const amont = await fetch(url, { headers: entetes, cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!amont.ok) return json({ erreur: `Price provider answered ${amont.status}`, fournisseur }, 502);
  const brut = await amont.json();

  let sortie;
  if (fournisseur === "twelvedata") {
    if (brut.status === "error") return json({ erreur: brut.message, fournisseur }, 502);
    sortie = {
      fournisseur, symbole, devise: brut.meta && brut.meta.currency,
      points: (brut.values || []).map((v) => ({ t: v.datetime, cloture: Number(v.close) }))
        .filter((p) => isFinite(p.cloture)).reverse(),
    };
  } else {
    const r = brut.chart && brut.chart.result && brut.chart.result[0];
    if (!r) return json({ erreur: "Unexpected provider payload", fournisseur }, 502);
    const ts = r.timestamp || [];
    const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
    // le cours AJUSTE integre splits et dividendes : c'est celui qui se
    // compare a un historique de resultats retraite
    const adj = (r.indicators && r.indicators.adjclose && r.indicators.adjclose[0]
      && r.indicators.adjclose[0].adjclose) || q.close || [];
    sortie = {
      fournisseur, symbole, devise: r.meta && r.meta.currency,
      points: ts.map((t, i) => ({
        t: new Date(t * 1000).toISOString().slice(0, 10),
        cloture: q.close ? q.close[i] : adj[i],   // cours du jour, non retraite
        ajuste: adj[i],                            // retraite splits + dividendes
      })).filter((p) => p.cloture !== null && p.cloture !== undefined && isFinite(p.cloture)),
    };
  }

  const reponse = json(sortie);
  ctx.waitUntil(cache.put(cleCache, reponse.clone()));
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

    // Liste des depots d'une societe : sert a retrouver les 8-K de resultats.
    const s = chemin.match(/^\/submissions\/(\d{1,10})$/);
    if (s) {
      const cik = String(Number(s[1])).padStart(10, "0");
      return relayer(`https://data.sec.gov/submissions/CIK${cik}.json`, ctx);
    }

    // Cours de bourse. La SEC ne publie aucun prix : il faut une source
    // exterieure. Le fournisseur est choisi par la variable d'environnement
    // FOURNISSEUR_PRIX ; a defaut on interroge Yahoo Finance, qui ne demande
    // pas de cle mais reste un point d'acces NON OFFICIEL (pas de garantie de
    // service, conditions d'utilisation floues). Poser une cle Twelve Data ou
    // Tiingo dans les variables du Worker bascule sur une source contractuelle
    // sans rien changer au site.
    const px = chemin.match(/^\/prix\/([A-Za-z0-9.\-]{1,12})$/);
    if (px) {
      const symbole = px[1].toUpperCase();
      const params = new URL(requete.url).searchParams;
      const plage = /^\d{1,2}y$/.test(params.get("range") || "") ? params.get("range") : "15y";
      const pas = ["1d", "1wk", "1mo"].includes(params.get("interval")) ? params.get("interval") : "1mo";
      return relayerPrix(symbole, plage, pas, env, ctx);
    }

    // Archives de depots au-dela des 1000 derniers (filings.files).
    const ar = chemin.match(/^\/submissions-archive\/([\w-]+\.json)$/);
    if (ar) return relayer(`https://data.sec.gov/submissions/${ar[1]}`, ctx);

    // Contenu d'un depot. Le nom de fichier est libre cote SEC (un communique
    // de resultats s'appelle "exhibit991earningsrelease-.htm" chez l'un et
    // "erq2fy26.htm" chez l'autre), d'ou le passe-plat.
    const a = chemin.match(/^\/archive\/(\d{1,10})\/(\d{10,20})\/(.+)$/);
    if (a) {
      const cik = Number(a[1]);
      const nom = a[3];
      // On refuse tout ce qui n'est pas un fichier de depot : pas de traversee.
      if (!/^[\w.-]+$/.test(nom)) return json({ erreur: "Nom de fichier invalide" }, 400);
      return relayer(`https://www.sec.gov/Archives/edgar/data/${cik}/${a[2]}/${nom}`, ctx, false);
    }

    return json({
      erreur: "Route inconnue",
      routes: ["/facts/<CIK>", "/submissions/<CIK>", "/archive/<CIK>/<accession>/<fichier>", "/tickers"],
    }, 404);
  },
};
