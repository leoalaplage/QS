#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genere web/data/tickers.json a partir de la liste officielle de la SEC.

Le site est statique : il ne peut pas appeler www.sec.gov depuis le navigateur
(pas d'en-tetes CORS). La table ticker -> CIK est donc embarquee dans le depot,
sous une forme compacte : {"AAPL": [320193, "Apple Inc."], ...}

Usage :
    ./.venv/bin/python tools/build_tickers.py            # depuis le cache local
    ./.venv/bin/python tools/build_tickers.py --telecharger
"""

import argparse
import json
import os
import sys
from urllib.request import Request, urlopen

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(RACINE, "data", "sec_company_tickers.json")
SORTIE = os.path.join(RACINE, "web", "data", "tickers.json")
URL = "https://www.sec.gov/files/company_tickers.json"
CONTACT = "leoalaplage@gmail.com"


def charger(telecharger: bool) -> dict:
    if telecharger or not os.path.exists(CACHE):
        print(f"Telechargement de {URL} ...")
        req = Request(URL, headers={"User-Agent": f"QS-Chart/1.0 ({CONTACT})"})
        with urlopen(req, timeout=30) as r:
            data = r.read()
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        with open(CACHE, "wb") as f:
            f.write(data)
    with open(CACHE, "rb") as f:
        return json.load(f)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--telecharger", action="store_true",
                   help="Force le re-telechargement depuis la SEC.")
    args = p.parse_args()

    brut = charger(args.telecharger)
    table = {}
    for row in brut.values():
        tk = str(row["ticker"]).upper().strip()
        if not tk:
            continue
        # le 1er gagne : la liste SEC est deja triee par capitalisation
        table.setdefault(tk, [int(row["cik_str"]), str(row["title"]).strip()])

    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    with open(SORTIE, "w", encoding="utf-8") as f:
        json.dump(table, f, ensure_ascii=False, separators=(",", ":"))

    taille = os.path.getsize(SORTIE) / 1024
    print(f"{len(table)} tickers ecrits dans {os.path.relpath(SORTIE, RACINE)} ({taille:.0f} Ko)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
