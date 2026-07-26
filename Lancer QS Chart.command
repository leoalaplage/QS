#!/bin/bash
# =====================================================================
#  QS Chart - lanceur clef en main (double-clic sur macOS)
# =====================================================================
#  1. se place dans le dossier du script
#  2. prepare l'environnement Python (venv + matplotlib) si besoin
#  3. lance le script interactif : il demande le ticker, la metrique
#     et la duree, puis genere un graphe PNG dans 'qs_out'.
# =====================================================================

cd "$(dirname "$0")" || exit 1
echo "=============================================="
echo "            QS  CHART  (EDGAR)"
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
if ! ./.venv/bin/python -c "import matplotlib" >/dev/null 2>&1; then
  echo "Installation de matplotlib (une seule fois)..."
  ./.venv/bin/pip install --quiet matplotlib
fi

# --- lancement (mode interactif) -------------------------------------
./.venv/bin/python qs_chart.py "$@"

echo
echo "Termine. Les images PNG sont dans le dossier 'qs_out'."
read -r -p "Appuie sur Entree pour fermer cette fenetre."
