# -*- coding: utf-8 -*-
"""
QS Screener - Generation du rapport (Dashboard + Methodology)
=============================================================
Construit un rapport de 2 pages (paysage A4) :
  1. Dashboard : classement colore des actions.
  2. Methodology : explication detaillee de chaque metrique et du calcul.

Sortie principale : des images PNG (une par page), via PyMuPDF.
Le PDF reste disponible en option.

Dependances : fpdf2 (mise en page) et, pour le PNG, pymupdf (rasterisation).
Tout est en anglais (rapport 100% anglais).
"""

from datetime import date
import sys

import qs_config as cfg

PILIERS = ["Quality", "Health", "Growth", "Value"]
NOMS_PILIERS_LONG = {
    "Quality": "QUALITY", "Health": "HEALTH", "Growth": "GROWTH", "Value": "VALUE",
}
BLEU = (31, 56, 100)
GRIS = (240, 242, 246)
GRIS_BORD = (210, 214, 220)


def _couleur_score(v):
    """Echelle 3 couleurs rouge(0) -> jaune(50) -> vert(100)."""
    if v is None:
        return (235, 235, 235)
    v = max(0.0, min(100.0, float(v)))
    rouge, jaune, vert = (248, 105, 107), (255, 235, 132), (99, 190, 123)
    if v <= 50:
        t, a, b = v / 50.0, rouge, jaune
    else:
        t, a, b = (v - 50.0) / 50.0, jaune, vert
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _txt_sur(couleur):
    r, g, b = couleur
    return (20, 20, 20) if (0.299 * r + 0.587 * g + 0.114 * b) > 150 else (255, 255, 255)


# ===========================================================================
#  Construction du document (2 pages)
# ===========================================================================
def _construire(titres, tous_titres, poids, preset=None):
    from fpdf import FPDF

    titres_tri = sorted(titres, key=lambda x: x["rang"])
    MARGE = 10

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(False)
    pdf.set_margins(MARGE, MARGE, MARGE)
    LARG = pdf.epw

    def bandeau(titre, sous_titre=""):
        pdf.set_fill_color(*BLEU)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_x(MARGE)
        pdf.cell(LARG, 11, f"  {titre}", border=0, align="L", fill=True,
                 new_x="LMARGIN", new_y="NEXT")
        if sous_titre:
            pdf.set_font("Helvetica", "", 8.5)
            pdf.set_text_color(70, 70, 70)
            pdf.set_x(MARGE)
            pdf.cell(LARG, 6, sous_titre, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)
        pdf.set_text_color(20, 20, 20)

    def entete_table(cols, h=7):
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(*BLEU)
        pdf.set_text_color(255, 255, 255)
        pdf.set_draw_color(*GRIS_BORD)
        for libelle, w, _ in cols:
            pdf.cell(w, h, libelle, border=1, align="C", fill=True)
        pdf.ln()
        pdf.set_text_color(20, 20, 20)

    # =====================================================================
    #  PAGE 1  -  DASHBOARD (classement)
    # =====================================================================
    sous = (f"Universe: {len(tous_titres)} stocks   |   shown: {len(titres_tri)}   |   "
            f"weights " + " / ".join(f"{p} {poids[p]}" for p in PILIERS)
            + (f"   |   preset {preset}" if preset else "")
            + f"   |   {date.today().isoformat()}")
    cols = [
        ("Rank", 9, "rank"), ("Ticker", 19, "ticker"), ("Sector", 28, "sector"),
        ("Cap $Bn", 15, "cap"),
        ("Qual", 15, "Quality"), ("Health", 15, "Health"),
        ("Growth", 15, "Growth"), ("Value", 15, "Value"),
        ("TOTAL", 16, "total"), ("Grade", 12, "note"),
        ("Valuation", 23, "valuation"),
        ("R.Adj", 14, "conviction"), ("Data", 12, "data"),
        ("Sect", 12, "sect"), ("Alerts", 12, "alertes"), ("Q+V", 13, "qv"),
    ]

    noms_pages = []

    def page_dashboard(cont):
        pdf.add_page()
        noms_pages.append("dashboard")
        if cont:
            bandeau("QS SCREENER  -  Dashboard (cont.)")
        else:
            bandeau("QS SCREENER  -  Dashboard", sous)
        entete_table(cols)
        pdf.set_font("Helvetica", "", 8)

    BAS = pdf.h - 14                 # limite basse avant saut de page
    page_dashboard(cont=False)
    for idx, t in enumerate(titres_tri):
        if pdf.get_y() + 5.8 > BAS:  # plus de place -> nouvelle page dashboard
            page_dashboard(cont=True)
        zebre = GRIS if idx % 2 else (255, 255, 255)
        for libelle, w, cle in cols:
            if cle in ("Quality", "Health", "Growth", "Value"):
                val = t["piliers"][cle]
                fond = _couleur_score(val)
                pdf.set_fill_color(*fond)
                pdf.set_text_color(*_txt_sur(fond))
                pdf.cell(w, 5.8, "n/a" if val is None else f"{val:.1f}",
                         border=1, align="C", fill=True)
            elif cle == "total":
                fond = _couleur_score(t["total"])
                pdf.set_fill_color(*fond)
                pdf.set_text_color(*_txt_sur(fond))
                pdf.set_font("Helvetica", "B", 8)
                pdf.cell(w, 5.8, "n/a" if t["total"] is None else f"{t['total']:.1f}",
                         border=1, align="C", fill=True)
                pdf.set_font("Helvetica", "", 8)
            elif cle == "conviction":
                fond = _couleur_score(t["conviction"])
                pdf.set_fill_color(*fond)
                pdf.set_text_color(*_txt_sur(fond))
                pdf.cell(w, 5.8, "n/a" if t["conviction"] is None else f"{t['conviction']:.1f}",
                         border=1, align="C", fill=True)
            elif cle == "data":
                cov = t.get("couverture", 1.0) * 100
                fond = _couleur_score(cov)
                pdf.set_fill_color(*fond)
                pdf.set_text_color(*_txt_sur(fond))
                pdf.cell(w, 5.8, f"{cov:.0f}", border=1, align="C", fill=True)
            elif cle == "valuation":
                fond = _couleur_score(t["piliers"]["Value"])
                pdf.set_fill_color(*fond)
                pdf.set_text_color(*_txt_sur(fond))
                etiquette = ("* " if t["sweet_spot"] else "") + t["valuation"]
                pdf.set_font("Helvetica", "B" if t["sweet_spot"] else "", 7.5)
                pdf.cell(w, 5.8, etiquette, border=1, align="C", fill=True)
                pdf.set_font("Helvetica", "", 8)
            elif cle == "alertes":
                a = t["alertes"]
                fond = (255, 199, 206) if a else zebre
                pdf.set_fill_color(*fond)
                pdf.set_text_color(192, 0, 0) if a else pdf.set_text_color(20, 20, 20)
                pdf.cell(w, 5.8, str(a), border=1, align="C", fill=True)
            elif cle == "qv":
                x0, y0 = pdf.get_x(), pdf.get_y()
                if t.get("qv_median"):
                    pdf.set_fill_color(99, 190, 123)
                    pdf.cell(w, 5.8, "", border=1, align="C", fill=True)
                    pdf.set_draw_color(255, 255, 255)
                    pdf.set_line_width(0.6)
                    pdf.line(x0 + w * 0.30, y0 + 3.1, x0 + w * 0.44, y0 + 4.3)
                    pdf.line(x0 + w * 0.44, y0 + 4.3, x0 + w * 0.72, y0 + 1.7)
                    pdf.set_line_width(0.2)
                    pdf.set_draw_color(*GRIS_BORD)
                else:
                    pdf.set_fill_color(*zebre)
                    pdf.cell(w, 5.8, "", border=1, align="C", fill=True)
            else:
                pdf.set_fill_color(*zebre)
                pdf.set_text_color(20, 20, 20)
                texte = {
                    "rank": str(t["rang"]),
                    "ticker": t["Ticker"] + (" *" if t["sweet_spot"] else ""),
                    "sector": t["Secteur"][:18],
                    "cap": f"{t['Cap']:.0f}" if t["Cap"] is not None else "",
                    "note": t["note"],
                    "sect": f"{t['rang_secteur']}/{t['taille_secteur']}",
                }[cle]
                align = "L" if cle in ("ticker", "sector") else "C"
                if cle == "ticker":
                    pdf.set_font("Helvetica", "B", 8)
                pdf.cell(w, 5.8, f" {texte}" if align == "L" else texte,
                         border=1, align=align, fill=True)
                if cle == "ticker":
                    pdf.set_font("Helvetica", "", 8)
        pdf.ln()

    # legende (sur une nouvelle page dashboard si plus assez de place)
    if pdf.get_y() + 16 > pdf.h - 8:
        page_dashboard(cont=True)
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(90, 90, 90)
    pdf.set_x(MARGE)
    pool = "sector (else universe)" if cfg.PERCENTILE_SECTORIEL else "the whole universe"
    if cfg.MELANGE_ABSOLU > 0:
        base = (f"Every score (0-100) blends {int(round(cfg.MELANGE_RELATIF*100))}% relative rank "
                f"(within {pool}) + {int(round(cfg.MELANGE_ABSOLU*100))}% absolute anchors")
    else:
        base = f"Every score (0-100) is a relative percentile rank within {pool}"
    pdf.multi_cell(LARG, 4,
        base + " - see the Methodology page. Colors run red -> yellow -> green. Grade = TOTAL "
        "(NR = not rated: too little data). R.Adj = risk-adjusted score (TOTAL minus a penalty "
        "per risk alert). Data = % of the score backed by real data. Valuation = Value pillar "
        "(Attractive / Fair / Expensive). '*' = project target: attractive valuation, "
        f"solid quality (Quality >= {cfg.SWEET_SPOT_QUALITE}) AND sound balance sheet "
        f"(Health >= {getattr(cfg, 'SWEET_SPOT_SANTE', 0)}). "
        "Q+V (green check) = Quality AND Value both at or above the universe median.")
    pdf.set_text_color(20, 20, 20)

    # =====================================================================
    #  PAGE 2  -  METHODOLOGY
    # =====================================================================
    pdf.add_page()
    noms_pages.append("methodology")
    _soustitre = ("Relative + absolute scoring" if cfg.MELANGE_ABSOLU > 0
                  else "Relative scoring") + ", auto-calibrated to the universe you provide."
    bandeau("Methodology  -  how each score is built", _soustitre)

    rel = int(round(cfg.MELANGE_RELATIF * 100))
    absp = int(round(cfg.MELANGE_ABSOLU * 100))
    montre_ancres = cfg.MELANGE_ABSOLU > 0
    pool = "the SECTOR (if enough peers) else the whole universe" \
        if cfg.PERCENTILE_SECTORIEL else "the WHOLE UNIVERSE (one single pool)"
    pdf.set_font("Helvetica", "", 8)
    pdf.set_x(MARGE)
    if montre_ancres:
        intro = (f"Each metric score (0-100) = {rel}% RELATIVE + {absp}% ABSOLUTE.  "
                 f"RELATIVE = percentile rank within {pool} "
                 "(100 = best, 50 = median, 0 = worst).  ABSOLUTE = raw value mapped onto fixed "
                 "'quality-investing' anchors (last column: value scoring 0 -> value scoring 100), "
                 "so a mediocre company can't score high just because its peers are worse; negative "
                 "valuation multiples count as worst, not cheap.\n")
    else:
        intro = (f"Each metric score (0-100) is a pure PERCENTILE RANK within {pool} "
                 "(100 = best of the group, 50 = median, 0 = worst). No absolute anchors are "
                 "applied: a score means 'position within this basket', not an absolute verdict. "
                 "Add or remove a stock and everything recomputes.\n")
    pdf.multi_cell(LARG, 4.0,
        intro + "PILLAR = weighted average of its metric scores (weights below).  TOTAL = weighted "
        "average of pillars: " + " / ".join(f"{p} {poids[p]}%" for p in PILIERS)
        + ".  Missing metrics are dropped and the remaining weights renormalized (not set to 50); "
        f"below {int(round(getattr(cfg, 'SEUIL_COUVERTURE', 0)*100))}% data coverage no grade is "
        "given (NR). Negative valuation multiples count as worst, never cheap.")
    pdf.ln(1)

    # tableau des metriques par pilier
    metr_par_pilier = {}
    for m in cfg.METRIQUES:
        metr_par_pilier.setdefault(m["pilier"], []).append(m)

    largeur_ancre = 26 if montre_ancres else 0
    LARG_DESC = LARG - 44 - 11 - 14 - largeur_ancre
    cols_m = [("Metric", 44, None), ("Wt", 11, None), ("% TOTAL", 14, None)]
    if montre_ancres:
        cols_m.append(("Anchor 0->100", 26, None))
    cols_m.append(("What it measures", LARG_DESC, None))
    entete_table(cols_m, h=5.5)
    HR = 4.4
    for pilier in PILIERS:
        metrs = metr_par_pilier.get(pilier, [])
        sp = sum(mm["poids"] for mm in metrs) or 1
        # bandeau de pilier
        pdf.set_fill_color(*BLEU)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(LARG, HR, f"  {NOMS_PILIERS_LONG[pilier]}  -  {poids[pilier]}% of TOTAL",
                 border=1, align="L", fill=True)
        pdf.ln()
        pdf.set_text_color(20, 20, 20)
        for j, m in enumerate(metrs):
            zebre = GRIS if j % 2 else (255, 255, 255)
            pdf.set_fill_color(*zebre)
            pdf.set_font("Helvetica", "B", 7.5)
            pdf.cell(44, HR, " " + cfg.NOMS_METRIQUES.get(m["cle"], m["cle"]),
                     border=1, align="L", fill=True)
            pdf.set_font("Helvetica", "", 7.5)
            pct = round(m["poids"] / sp * 100)
            pdf.cell(11, HR, f"{pct}%", border=1, align="C", fill=True)
            eff = m["poids"] / sp * poids[pilier]
            pdf.cell(14, HR, f"{eff:.1f}%", border=1, align="C", fill=True)
            if montre_ancres:
                ancre = cfg.ANCRES_ABSOLUES.get(m["cle"])
                txt_ancre = f"{ancre[0]:g} -> {ancre[1]:g}" if ancre else "-"
                pdf.cell(26, HR, txt_ancre, border=1, align="C", fill=True)
            pdf.cell(LARG_DESC, HR,
                     " " + cfg.DESCRIPTIONS_METRIQUES.get(m["cle"], ""),
                     border=1, align="L", fill=True)
            pdf.ln()

    # bloc "layers" additionnels
    pdf.ln(1.5)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.set_text_color(*BLEU)
    pdf.set_x(MARGE)
    pdf.cell(LARG, 4.5, "Added layers", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(20, 20, 20)
    pdf.set_font("Helvetica", "", 7.4)

    grades = ", ".join(f"{g} >= {s}" for g, s in cfg.GRILLE_NOTES)
    valos = ", ".join(f"{lbl} >= {s}" for lbl, s in cfg.NIVEAUX_VALUATION)
    alertes = "; ".join(f"{lib}" for lib, *_ in cfg.REGLES_ALERTES)
    for ligne in [
        f"Grade (letter on TOTAL): {grades}.",
        f"Risk-adjusted score (R.Adj) = TOTAL - {cfg.MALUS_ALERTE} x (number of risk alerts), "
        f"floored at 0.  Valuation (from Value pillar): {valos}.",
        f"'*' sweet spot = Valuation 'Attractive' AND Quality >= {cfg.SWEET_SPOT_QUALITE} "
        f"AND Health >= {getattr(cfg, 'SWEET_SPOT_SANTE', 0)}.  Risk alerts counted: {alertes}.",
    ]:
        pdf.set_x(MARGE)
        pdf.multi_cell(LARG, 3.9, ligne)

    return pdf, noms_pages


# ===========================================================================
#  Sorties
# ===========================================================================
def _nom_fichier(labels):
    """Construit les noms de fichiers PNG a partir des etiquettes de page
    (les pages 'dashboard' sont numerotees s'il y en a plusieurs)."""
    nb_dash = labels.count("dashboard")
    noms, i_dash = [], 0
    for label in labels:
        if label == "dashboard":
            i_dash += 1
            if nb_dash == 1:
                noms.append("QS_Screener_dashboard.png")
            else:
                noms.append(f"QS_Screener_dashboard_{i_dash}.png")
        else:
            noms.append("QS_Screener_methodology.png")
    return noms


def generer_pdf(titres, tous_titres, poids, chemin, preset=None):
    """Ecrit le rapport complet en PDF. Renvoie True si ok."""
    try:
        pdf, _ = _construire(titres, tous_titres, poids, preset)
    except ImportError:
        return False
    pdf.output(chemin)
    return True


def generer_images(titres, tous_titres, poids, dossier, preset=None, dpi=200):
    """Rasterise le rapport en PNG (une image par page). Renvoie la liste des
    chemins produits, ou None si une dependance manque."""
    try:
        pdf, labels = _construire(titres, tous_titres, poids, preset)
    except ImportError:
        return None
    # PyMuPDF 1.28 se bloque au chargement avec Python 3.14 sur macOS.
    # Le lanceur produit alors le rapport PDF, ouvrable dans Apercu, plutot que
    # de rester fige avant meme de commencer l'analyse.
    if sys.version_info >= (3, 14):
        return None
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return None

    data = bytes(pdf.output())
    doc = fitz.open(stream=data, filetype="pdf")
    noms = _nom_fichier(labels)
    chemins = []
    import os, glob
    # purge des anciens PNG (evite qu'un run precedent a N pages laisse des fichiers perimes)
    for vieux in glob.glob(os.path.join(dossier, "QS_Screener_dashboard*.png")) + \
            glob.glob(os.path.join(dossier, "QS_Screener_methodology*.png")):
        try:
            os.remove(vieux)
        except OSError:
            pass
    for i in range(doc.page_count):
        nom = noms[i] if i < len(noms) else f"QS_Screener_page{i + 1}.png"
        chemin = os.path.join(dossier, nom)
        doc[i].get_pixmap(dpi=dpi).save(chemin)
        chemins.append(chemin)
    doc.close()
    return chemins
