# QS Screener v3 — screener d'actions « Quality »

Automatise et **prolonge** le système de notation de ton Google Sheet
**QS Screener v2**. Tu donnes **un fichier CSV** avec les données de ton univers,
et le programme te sort tout : percentiles par métrique, les 4 piliers
(Quality / Health / Growth / Value), le score **TOTAL**, une **note-lettre**, un
**score de conviction** ajusté du risque, une **colonne Valuation**, le classement
et les **alertes** — sous forme de **2 images PNG prêtes à l'emploi** (+ CSV) :
1. **`QS_Screener_dashboard.png`** — le classement coloré complet ;
2. **`QS_Screener_methodology.png`** — l'explication détaillée de chaque métrique
   et du calcul (comment Quality/Health/Growth/Value et le TOTAL sont construits).

---

## 🌐 Le site web (`web/`)

Une version navigateur des deux outils, pensée pour le copier-coller et
déployée sur **GitHub Pages**. Voir [`web/README.md`](web/README.md).

| Page | Ce qu'elle fait |
|---|---|
| **S&P 500** (`sp500.html`) | Crible les 501 sociétés couvertes depuis l'index pré-calculé, puis charge la fiche annuelle / trimestrielle / TTM d'une société à la demande. |
| **Tableau** (`index.html`) | Tu colles ton export (ou tu déposes un CSV) → le dashboard coloré en PNG, plus la page Methodology et le CSV des résultats. |
| **Chart** (`chart.html`) | Recherche parmi les ~10 400 sociétés cotées aux US (par nom ou ticker) + métrique + **annuel / trimestriel / TTM** → le graphe historique EDGAR en PNG. |
| **FCF** (`fcf.html`) | Compare croissance, régularité et stabilité de valorisation du free cash flow. |
| **Portfolio** (`portfolio.html`) | Produit une fiche portefeuille A4 en PNG. |
| **Filings** (`filings.html`) | Lit et trace les KPI qui vivent dans les tableaux des dépôts plutôt que dans XBRL. |

Les images s'affichent dans la page ; le téléchargement et la copie dans le
presse-papiers sont des boutons en plus, pas un passage obligé.

La page Chart lit les taxonomies `us-gaap` **et** `ifrs-full`, dans la devise de
publication : ASML en EUR, Novo Nordisk en DKK, TSMC en TWD, SAP en EUR. Chaque
graphe est accompagné d'un panneau d'audit (tag XBRL retenu, devise, nombre de
points, formulaires source, trimestres reconstitués, contrôles de cohérence).
Une société qui ne cote pas aux États-Unis n'a aucun dépôt SEC et reste donc
hors de portée (Constellation Software, Hermès).

Le moteur de notation est un **port fidèle** de `qs_screener.py` + `qs_config.py`
en JavaScript : sur le même CSV, le site sort **exactement les mêmes chiffres**
que la ligne de commande (vérifié titre par titre sur `data/fiscal-ai-dashboard.csv`).
Tout tourne dans le navigateur — aucune donnée n'est envoyée nulle part.

> Le site répare au passage une limite locale : `qs_pdf.generer_images()` saute
> la rastérisation sur Python 3.14 (PyMuPDF se bloque, cf. `qs_pdf.py:369`), donc
> en local tu n'obtiens plus que le PDF. La version web dessine le PNG
> directement sur `<canvas>` et n'a pas ce problème.

**Une seule dépendance externe** : un petit relais Cloudflare Worker
([`worker/`](worker/README.md)) pour la page Chart, parce que la SEC ne renvoie
pas d'en-têtes CORS. La page Tableau, elle, ne dépend de rien.

---

## ▶️ Clef en main (le plus simple)

**Double-clique sur `Lancer QS Screener.command`.**

Au premier lancement il prépare tout seul l'environnement, puis à chaque fois il :
1. cherche ton fichier CSV (dans ce dossier ou dans `data/`) — s'il y en a
   plusieurs, il te demande lequel ;
2. calcule tout ;
3. **ouvre automatiquement l'image** dashboard.

Deux images sont produites : le **Dashboard** (classement) et la **Methodology**
(explication de chaque métrique). Elles sont entièrement en anglais.

> Si macOS bloque le premier lancement (« développeur non identifié »), fais un
> **clic droit → Ouvrir → Ouvrir**. C'est à faire une seule fois.

Pour analyser **ta** data : dépose simplement ton `.csv` dans le dossier `QS`
(ou dans `QS/data`) et relance. Le format attendu est décrit plus bas ; le
fichier [`data/univers_exemple.csv`](data/univers_exemple.csv) sert de modèle.

---

## 🧠 Le système de notation (relatif, univers unique)

Chaque métrique reçoit un score 0–100 = **rang-percentile dans l'univers entier**
(un seul pool de tous les titres du CSV) : 100 = meilleur, 50 = médiane, 0 = pire.
Base de comparaison **identique pour tous** — pas d'artefact de taille de secteur.

Deux options désactivées par défaut, réactivables dans `qs_config.py` :
- **Volet absolu** (`MELANGE_ABSOLU`) : mélange le percentile avec des **ancres
  fixes** (ex. ROIC 30 % → 100) pour ancrer la note à des standards absolus.
- **Percentile sectoriel** (`PERCENTILE_SECTORIEL`) : compare chaque titre à son
  secteur plutôt qu'à tout l'univers.

Piliers et poids (**45 / 20 / 15 / 20**). Le **poids réel dans le TOTAL** d'une
métrique = poids intra × poids du pilier (ex. ROIC 5a = 20 % × 45 % = **9 %**) ;
il est affiché sur la page *Methodology*.
- **Quality 45 %** : ROIC 5a (20) et marge FCF 5a (20) dominants, marge opér. (15),
  ROIC courant (10), conv. FCF/résultat (10), marge brute (5), dilution (10), SBC/CA (10).
- **Health 20 %** : dette nette/EBITDA (35) et EBIT/intérêts (35) dominants,
  capex coverage (15), dette LT/actifs (10), current ratio (5, dégradé).
- **Growth 15 %** : la **croissance du cash domine** — FCF 5a + FCF/action (35 combiné),
  CA prévu 3a (20), résultat net 5a (20), CA 5a + CA/action (25 combiné).
- **Value 20 %** : EV/EBIT (35), P/FCF fwd (25), FCF yield (25), EV/FCF **allégé à 15**
  (doublon partiel de FCF yield ; FCF yield gardé car cohérent avec un FCF *levered*).

Une cellule vide est neutralisée (50). **Alertes** : dilution, SBC/CA > 8 %,
levier > 2,5x, EV/FCF > 40, croissance prévue < 8 %.

### Ce que la v3 ajoute (« plus pointu »)
| Ajout | À quoi ça sert |
|---|---|
| **Note-lettre** (A+ … D, ou **NR**) | lecture immédiate du TOTAL ; **NR** = données insuffisantes |
| **Risk-adjusted score** (ex-« Conviction ») | `TOTAL − (alertes × malus)` |
| **Data confidence** | % du score réellement adossé à des données (colonne `Data`) |
| **Données manquantes gérées** | pas de 50 automatique : le pilier est recalculé sur les métriques présentes ; sous 75 % de couverture → **NR**. Un multiple de valo négatif compte comme « cher », jamais « bon marché » |
| **Forces / Faiblesses** | les 3 meilleures et 3 pires métriques de chaque action |
| **Colonne Valuation** | `Attractive` / `Fair` / `Expensive` (d'après le pilier Value) |
| **Repère « sweet spot » `*`** | cible du projet : **valo attractive + Quality ≥ 60 + Health ≥ 50** (réglable) |
| **Plafonds économiques** | cash conversion, capex coverage et interest coverage plafonnés (250 % ne bat plus 120 %, etc.) |
| **Rapport 100 % anglais** | dashboard + méthodologie en anglais (`secteurs.csv` aussi) |

> **Notes importantes.** La **structure** (4 piliers, percentiles, alertes) vient
> du Google Sheet, mais le **scoring a évolué** : mélange relatif + absolu, poids
> 45/20/15/20, dé-doublonnage du pilier Value et ajout des métriques par action.
> Les résultats **diffèrent donc volontairement** de la feuille. La **note-lettre**,
> le **score de conviction** et le **repère Valuation/sweet-spot** sont des
> ajouts (absents de la feuille), tous réglables dans `qs_config.py`.

---

## ⌨️ Utilisation en ligne de commande (optionnel)

```bash
cd ~/Desktop/QS
./.venv/bin/python qs_screener.py MON_FICHIER.csv [options]
```

| Option | Effet |
|---|---|
| `--preset {defaut,quality-purist,value-aware}` | Jeu de poids des piliers |
| `--classer-par {total,conviction}` | Critère de classement (défaut : total) |
| `--min-score N` | Ne garder que TOTAL ≥ N |
| `--max-alertes N` | Ne garder que Alertes ≤ N |
| `--note A+` | Filtrer une note-lettre (répétable) |
| `--valo-attractive` | Ne garder que les valos `Attractive` |
| `--sweet-spot` | Ne garder que la cible : qualité solide + valo attractive |
| `--secteur "Software"` | Filtrer un secteur (répétable) |
| `--cap-min N` | Capitalisation minimale ($Md) |
| `--pilier-min Quality=60` | Seuil minimal sur un pilier (répétable) |
| `--top N` | Garder les N premiers |
| `--sans-winsor` | Désactive la winsorisation |
| `--delimiter ";"` | Force le séparateur CSV |
| `--open` | Ouvre l'image dashboard à la fin |
| `--dpi N` | Résolution des PNG (défaut 200) |
| `--pdf` | Génère **aussi** le rapport en PDF |
| `--excel` | Génère **aussi** un classeur Excel |
| `--no-images` / `--no-fichiers` | Sans PNG / console seulement |

Exemples :
```bash
# Les meilleurs sans risque, grosses capis
... --max-alertes 0 --cap-min 100
# Classement par conviction, preset quality purist, top 10
... --preset quality-purist --classer-par conviction --top 10
# Logiciels avec Quality solide
... --secteur Software --pilier-min Quality=50
```

> Les filtres n'affectent **que l'affichage / l'export** : les percentiles sont
> toujours calculés sur l'univers **complet** du CSV (comme dans la feuille).

---

## 📄 Format du CSV attendu

Une ligne par action. Les noms de colonnes sont **souples** (casse, accents et
espaces ignorés, plusieurs alias acceptés). Voir
[`data/univers_exemple.csv`](data/univers_exemple.csv) comme modèle et
[`qs_config.py`](qs_config.py) pour tous les alias.

Colonnes : `Ticker`, `Secteur`, `Cap. boursière ($Md)`, `ROIC (%)`,
`ROIC 5a moy (%)`, `Marge opér. (%)`, `Marge FCF 5a (%)`, `FCF/Rés. net (%)`,
`Marge brute 5a (%)`, `Dilution actions 5a (%)`, `SBC/CA (%)`,
`Dette nette/EBITDA`, `EBIT/Intérêts`, `Current ratio`, `Dette LT/Actifs`,
`OCF/Capex`, `CA CAGR 5a (%)`, `CA fwd 3a (%)`, `FCF CAGR 5a (%)`,
`Rés.net CAGR 5a (%)`, `EV/EBIT`, `EV/FCF`, `P/FCF fwd`, `FCF Yield (%)`,
`PEG (réf.)`, `OCF ($Md)`, `Capex ($Md)`.

- Colonne manquante → métrique neutralisée à 50 (avertissement affiché).
- Cellule vide → neutralisée pour cette action (ex. donnée aberrante).
- Décimales à la virgule acceptées si le séparateur de colonnes est `;`.

### Exports bruts (fiscal.ai, etc.) — pris en charge tels quels
Les valeurs avec **symboles et unités** sont nettoyées automatiquement :
`$5,023.34B`, `74.1%`, `-$6.57B`, `(123)`, suffixes `B/M/T/K`, séparateurs de
milliers. Les libellés anglais de fiscal.ai sont reconnus. Quand la colonne
`OCF/Capex` n'existe pas, elle est **calculée** depuis « Cash from Operations » ÷
« Capital Expenditure ».

### Secteur automatique (`secteurs.csv`)
Si ton CSV n'a pas de colonne `Secteur` (cas de fiscal.ai), le programme
complète le secteur depuis le fichier [`secteurs.csv`](secteurs.csv)
(`Ticker,Secteur`) placé à côté du script — déjà pré-rempli pour ton univers.
Ajoute-y simplement tes nouveaux tickers pour garder la page « analyse par
secteur ». Une colonne `Secteur` dans le CSV reste prioritaire.

---

## 📦 Sorties (dossier `qs_out/`)

- `QS_Screener_dashboard.png` — **l'image principale** : le classement coloré ;
- `QS_Screener_methodology.png` — l'explication détaillée de chaque métrique ;
- `resultats.csv` — le tableau complet (piliers, total, note, valuation, conviction,
  rangs, alertes, forces/faiblesses) ;
- `scores_detail.csv` — les percentiles 0–100 de chaque métrique ;
- `QS_Screener_rapport.pdf` — le rapport en PDF (option `--pdf`) ;
- `QS_Screener_resultats.xlsx` — classeur Excel (option `--excel`).

---

## 🔧 Régler le système de notation

Tout est dans **[`qs_config.py`](qs_config.py)**, sans toucher au moteur : poids
des piliers, poids/sens de chaque métrique, presets, **mélange relatif/absolu**
(`MELANGE_RELATIF` / `MELANGE_ABSOLU`), **ancres absolues** par métrique
(`ANCRES_ABSOLUES`), note-lettre, seuils de valuation et du sweet-spot, malus des
alertes, et règles d'alertes. Tu veux être plus sévère ? Baisse les ancres
« → 100 » (ex. exiger EV/EBIT = 10 au lieu de 12 pour un score de 100).

---

## Origine vs Google Sheet

La **structure** (4 piliers, notation par percentile, alertes) est inspirée de ta
feuille *QS Screener v2*. Le **calcul a depuis évolué** (retours sur review) :
mélange 60 % relatif + 40 % absolu, percentiles **intra-secteur** en priorité,
poids **45/20/15/20**, pilier Value **dé-doublonné**, ajout des métriques **par
action**. Les scores diffèrent donc volontairement de la feuille — c'est le but.

### Limite connue (données)
Ton export fiscal.ai est un **instantané**. Certaines améliorations demandées
(stabilité/médiane du ROIC sur 5 ans, régularité du FCF, valorisation vs son
propre historique, split FCFF/FCFE) exigent des **séries pluriannuelles** absentes
de l'export ; elles ne sont pas implémentées faute de données, pas par oubli.
