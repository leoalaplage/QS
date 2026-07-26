# Relais EDGAR — déploiement

Ce Worker existe pour une seule raison : **la SEC ne renvoie pas d'en-tête
`Access-Control-Allow-Origin`**. Vérifiable en une commande :

```bash
curl -s -o /dev/null -D - -A "Mozilla/5.0" -H "Origin: https://exemple.github.io" "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json" | grep -i "access-control\|^HTTP/"
```

La réponse est bien `HTTP/2 200`, mais **sans** `access-control-allow-origin` :
un navigateur sur GitHub Pages reçoit donc la réponse et la jette. En prime, la
SEC exige un `User-Agent` contenant un email de contact, et un navigateur ne
peut pas définir ce header lui-même.

Le Worker ajoute les deux, met en cache 12 h, et ne fait rien d'autre.

## Déploiement (une seule fois, ~3 minutes)

```bash
npm install -g wrangler
```

```bash
cd worker && wrangler login && wrangler deploy
```

`wrangler deploy` affiche à la fin une URL du type
`https://qs-edgar.<ton-compte>.workers.dev`.

Colle-la dans [`../web/js/qs-settings.js`](../web/js/qs-settings.js) :

```js
export const WORKER_URL_DEFAUT = "https://qs-edgar.ton-compte.workers.dev";
```

Puis commit + push : le site se redéploie tout seul.

> Sans cette étape, la page Chart reste utilisable : elle propose de saisir
> l'URL à la main (mémorisée dans le navigateur via `localStorage`). C'est
> pratique pour tester, mais chaque visiteur devrait le refaire.

## Gratuité

Le plan gratuit de Cloudflare Workers couvre 100 000 requêtes par jour. Avec le
cache de 12 h, un usage personnel consomme quelques dizaines de requêtes par
mois.

## Routes

| Route | Cible |
|---|---|
| `GET /facts/<CIK>` | `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json` |
| `GET /tickers` | `https://www.sec.gov/files/company_tickers.json` |
| `GET /` | message de santé (sert à vérifier que le Worker répond) |

Le site n'utilise pas `/tickers` : la table ticker → CIK est embarquée dans
`web/data/tickers.json` pour éviter un aller-retour réseau. La route existe pour
pouvoir la régénérer si besoin.

## Réglages

Dans [`index.js`](index.js) :

- `CONTACT` — l'email envoyé à la SEC dans le `User-Agent` ;
- `ORIGINES` — mets-y l'URL de ta page GitHub (ex.
  `"https://leo.github.io"`) au lieu de `"*"` si tu veux que seul ton site
  puisse appeler le relais ;
- `CACHE_SECONDES` — durée de cache (12 h par défaut ; EDGAR ne bouge qu'aux
  dépôts trimestriels).
