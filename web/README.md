# QS — le site

Site **statique**, **intégralement en anglais** (interface, messages, noms de
métriques, titres et axes des graphes) : six pages HTML, du CSS, des modules JS.
Pas de build, pas de framework, pas de `npm install`. Tout le calcul et tout le
rendu PNG se font dans le navigateur.

## Essayer en local

```bash
cd web && python3 -m http.server 8765
```

Puis ouvre <http://localhost:8765>. (Un simple double-clic sur `index.html` ne
marche pas : les modules ES sont bloqués par la politique `file://`.)

## Mettre en ligne sur GitHub Pages

1. Pousse le dépôt sur GitHub.
2. Dans **Settings → Pages**, choisis **Source : GitHub Actions**.
3. Le workflow [`../.github/workflows/pages.yml`](../.github/workflows/pages.yml)
   publie le dossier `web/` à chaque push sur `main`.
4. Pour la page Chart, déploie le relais et renseigne son URL :
   voir [`../worker/README.md`](../worker/README.md).

## Organisation

| Fichier | Rôle | Équivalent Python |
|---|---|---|
| `sp500.html` + `js/app-sp500.js` | screener S&P 500 sur l'index nocturne, fiche détaillée chargée à la demande | — |
| `js/qs-config.js` | poids, sens, ancres, alertes, seuils | `qs_config.py` |
| `js/qs-parse.js` | lecture CSV/TSV, nettoyage des valeurs | `charger_csv`, `_to_float` |
| `js/qs-engine.js` | percentiles, piliers, TOTAL, notes, rangs | `calculer_scores` |
| `js/qs-doc.js` | moteur de mise en page en mm sur canvas | `fpdf.FPDF` |
| `js/qs-dashboard.js` | dessin du Dashboard et de la Methodology | `qs_pdf.py` |
| `js/qs-chart-metrics.js` | définitions BASE / DERIVE | `qs_chart.py` |
| `js/qs-chart-edgar.js` | appel du relais, extraction des séries annuelles | `charger_facts`, `_extraire_annuel` |
| `js/qs-chart-draw.js` | tracé du graphe | `tracer()` (matplotlib) |
| `js/qs-settings.js` | URL du relais, résolution des PNG | — |
| `data/tickers.json` | table ticker → CIK (embarquée) | `data/sec_company_tickers.json` |
| `data/univers/index.json` | résumé des 501 sociétés, lu en un seul appel par le screener | — |
| `data/univers/<TICKER>.json` | 54 séries annuelles, trimestrielles et TTM d'une société | — |

## Modifier le système de notation

Tout est dans `js/qs-config.js`, dans le même ordre et avec les mêmes noms que
`qs_config.py`. **Les deux fichiers doivent rester synchronisés** : si tu
changes un poids d'un côté, reporte-le de l'autre, sinon le site et la ligne de
commande ne donneront plus les mêmes scores.

## Ce que la page Chart fait en plus de `qs_chart.py`

| | `qs_chart.py` | Le site |
|---|---|---|
| Périodes | annuel | **annuel, trimestriel, TTM** |
| Devises | `USD` uniquement | **toute devise ISO**, la mieux couverte l'emporte |
| Taxonomies | `us-gaap` | **`us-gaap` + `ifrs-full`** |
| Choix de la société | watchlist figée | **recherche sur les ~10 400 sociétés SEC**, par nom ou ticker |
| Traçabilité | aucune | **panneau d'audit** sous chaque graphe |

### Comment le trimestriel est construit

Le 4e trimestre n'est **jamais** déposé en 10-Q : il n'apparaît que dans le
total annuel du 10-K. Il est donc reconstitué par `Q4 = exercice − (Q1+Q2+Q3)`,
et seulement si les trois trimestres tombent exactement dans l'exercice et que
le trou restant fait bien un trimestre. Sur les années où les quatre trimestres
sont déjà publiés, la somme est comparée au total annuel : au-delà de 0,5 %
d'écart, une alerte remonte **en haut de page**, pas dans un panneau replié.

Le TTM somme 4 trimestres consécutifs pour les flux (CA, résultat, cash-flow)
et prend la valeur ponctuelle pour les postes de bilan — un stock ne se cumule
pas. Un ratio dont les composants seraient libellés en deux devises est écarté
plutôt qu'affiché.

### Deux pièges évités, à ne pas réintroduire

- **Ne jamais préférer l'USD par principe.** SAP publie 27 points en EUR et
  **1 seul** en USD (2017), TSMC 26 en TWD contre 9 en USD. La règle est : la
  devise la mieux couverte gagne, l'USD ne sert qu'à départager à égalité.
- **Vérifier un ticker avant de le mettre en dur.** Dans la table SEC, `DSY`
  désigne Big Tree Cloud Holdings, pas Dassault Systèmes.

## Différences assumées avec la version Python

- **Le Dashboard est une seule image**, haute autant qu'il faut, au lieu d'être
  découpé en pages A4. C'est plus pratique à copier-coller ; c'est le seul écart
  de mise en page.
- **Pas d'export PDF ni Excel** : le site produit les PNG et le CSV des
  résultats. Pour le PDF et le classeur Excel, utilise
  `qs_screener.py --pdf --excel`.
- **Pas de KPI manuels** (`data/kpi_manuel.csv`) sur la page Chart.

## Régénérer la table des tickers

Elle ne change qu'à l'entrée ou la sortie d'une société en bourse :

```bash
./.venv/bin/python tools/build_tickers.py --telecharger
```
