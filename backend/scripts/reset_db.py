"""Vide COMPLÈTEMENT la base configurée par DATABASE_URL (.env) — comptes
utilisateurs compris.

Irréversible. Pensé pour un seul usage : repartir d'une base vierge avant de
re-semer des événements de démo propres (cf. seed_demo_real_addresses.py),
pas un outil à lancer régulièrement.

Usage :
    .venv/Scripts/python.exe scripts/reset_db.py --yes-i-am-sure
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from app.db.base import get_engine

# Un seul TRUNCATE CASCADE plutôt qu'une suite de DELETE dont l'ordre serait
# à maintenir à la main à chaque nouvelle table — CASCADE suit les clés
# étrangères tout seul. RESTART IDENTITY n'a d'effet que sur d'éventuelles
# séquences (aucune ici, les id sont des UUID), gardé par cohérence avec un
# vidage complet.
TABLES = ["events_log", "solutions", "passengers", "drivers", "events", "geocode_cache", "users"]


async def reset() -> None:
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--yes-i-am-sure",
        action="store_true",
        help="Confirme le vidage complet et irréversible de la base (comptes utilisateurs compris).",
    )
    args = parser.parse_args()

    if not args.yes_i_am_sure:
        raise SystemExit(
            "Rien fait. Relance avec --yes-i-am-sure pour confirmer le vidage COMPLET et IRRÉVERSIBLE "
            "de la base (tous les comptes, événements, inscriptions et tournées calculées)."
        )

    asyncio.run(reset())
    print("Base vidée.")


if __name__ == "__main__":
    main()
