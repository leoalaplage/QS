#!/bin/bash
# =====================================================================
#  QS Screener - lanceur clef en main (double-clic sur macOS)
# =====================================================================
#  1. se place dans le dossier du script
#  2. prepare l'environnement Python (venv + openpyxl) si besoin
#  3. choisit le CSV a analyser (auto si un seul, sinon menu)
#  4. lance le screener et ouvre l'Excel colore
# =====================================================================

cd "$(dirname "$0")" || exit 1
echo "=============================================="
echo "            QS  SCREENER  v3"
echo "=============================================="
echo

# --- Python -----------------------------------------------------------
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 est introuvable. Installe-le depuis https://www.python.org puis relance."
  read -r -p "Appuie sur Entree pour fermer."
  exit 1
fi

# --- venv + bibliotheques --------------------------------------------
if [ ! -d ".venv" ]; then
  echo "Premiere utilisation : creation de l'environnement..."
  python3 -m venv .venv
fi
if ! ./.venv/bin/python -c "import fpdf, openpyxl" >/dev/null 2>&1; then
  echo "Installation des librairies du rapport..."
  ./.venv/bin/pip install --quiet fpdf2 openpyxl
fi

# --- selection du CSV -------------------------------------------------
# Cherche les CSV de donnees dans le dossier courant et dans data/ (hors dossier
# de sortie). secteurs.csv est un fichier de configuration interne : ce n'est
# pas un univers a analyser et il ne doit donc pas declencher le menu de choix.
CSVS=()
while IFS= read -r f; do CSVS+=("$f"); done < <(find . -maxdepth 2 -name "*.csv" \
    -not -path "./qs_out/*" -not -path "./.venv/*" \
    -not -name "secteurs.csv" | sed 's|^\./||' | sort)

if [ ${#CSVS[@]} -eq 0 ]; then
  echo "Aucun fichier CSV trouve."
  echo "Depose ton CSV dans ce dossier (ou dans le sous-dossier 'data') puis relance."
  read -r -p "Appuie sur Entree pour fermer."
  exit 1
elif [ ${#CSVS[@]} -eq 1 ]; then
  CHOIX="${CSVS[0]}"
else
  echo "Plusieurs fichiers CSV trouves :"
  i=1
  for f in "${CSVS[@]}"; do echo "   $i) $f"; i=$((i+1)); done
  echo
  read -r -p "Numero du fichier a analyser [1] : " NUM
  NUM=${NUM:-1}
  CHOIX="${CSVS[$((NUM-1))]}"
fi

echo
echo ">> Analyse de : $CHOIX"
echo ">> Le rapport s'ouvrira automatiquement a la fin de l'analyse."
echo

# --- lancement --------------------------------------------------------
./.venv/bin/python qs_screener.py "$CHOIX" --pdf --excel --open "$@"

echo
echo "Termine. Les images PNG et les fichiers sont dans le dossier 'qs_out'."
read -r -p "Appuie sur Entree pour fermer cette fenetre."
