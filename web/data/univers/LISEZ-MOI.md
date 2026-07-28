# Contrat de donnees — univers pre-calcule

Genere par `outils/ingerer.mjs`, une fois par nuit. Ne rien editer a la main.

## `index.json`

    { genere, univers, societes, echecs: [...], lignes: [ resume ] }

Un `resume` par societe : identite (ticker, nom, secteur, industrie,
devise), la DERNIERE valeur annuelle de quinze metriques vedettes avec sa
periode (`revenue`, `revenue__periode`, ...), les croissances composees
(`revenue_cagr5`, `revenue_cagr10`, `fcf_cagr5`) et le nombre
d'exercices disponibles.

Suffit a alimenter un screener sans ouvrir un seul fichier de societe.
478 Ko, un seul appel reseau.

## `<TICKER>.json`

    { ticker, cik, nom, entite, secteur, industrie, devise,
      series: { annuel: {metrique: {periode: valeur}},
                trimestre: {...}, ttm: {...} },
      alertes: [...] }

Les periodes sont des annees (`2025`) en annuel, des trimestres civils
(`2025Q4`) sinon, toujours placees a la FIN de la periode couverte.

`alertes` reprend les controles de coherence releves pendant le calcul --
retraitements comptables, changements de tag, ecarts entre trimestres
publies et reconstitues. Elles permettent d'expliquer un chiffre
surprenant sans relire les depots.

## Ce que ces fichiers ne contiennent pas

Aucun cours de bourse : ils bougent tous les jours et restent servis en
direct. Donc aucun ratio de valorisation non plus -- ils se calculent
dans le navigateur en croisant ces series avec le cours du moment.
