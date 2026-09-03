"""Crée deux événements de démo (ramassage + dispersion) avec de VRAIES
adresses de Montréal, géocodées côté serveur (Nominatim) exactement comme
le ferait un vrai utilisateur du formulaire — contrairement à
`seed_demo_event.py`, qui envoie des coordonnées toutes faites pour aller
vite et n'utilise que des libellés d'adresse génériques.

Plus lent (le géocodage est limité à 1 req/s côté serveur, cf.
NominatimClient) : compter environ 1 à 2 minutes pour 37 personnes x 2
événements. C'est le prix d'un géocodage réel plutôt que simulé.

Usage :
    .venv/Scripts/python.exe scripts/seed_demo_real_addresses.py
"""

from __future__ import annotations

import argparse

import httpx

DEPOT_ADDRESS = "1 Place Ville Marie, Montréal, QC"

# (adresse réelle, places) — 5 voitures 5 places + 2 voitures 7 places,
# dispersées dans plusieurs quartiers pour un vrai défi de tournées.
DRIVERS: list[tuple[str, int]] = [
    ("3575 Avenue du Parc, Montréal, QC", 5),
    ("5500 Boulevard Saint-Laurent, Montréal, QC", 5),
    ("4200 Rue Sainte-Catherine Est, Montréal, QC", 5),
    ("6000 Rue Sherbrooke Est, Montréal, QC", 5),
    ("2000 Rue Peel, Montréal, QC", 5),
    ("1000 Rue Wellington, Montréal, QC", 7),
    ("500 Boulevard René-Lévesque Ouest, Montréal, QC", 7),
]

PASSENGER_ADDRESSES: list[str] = [
    "4800 Rue Rachel Est, Montréal, QC",
    "1200 Avenue du Mont-Royal Est, Montréal, QC",
    "3400 Rue Saint-Denis, Montréal, QC",
    "7000 Avenue Papineau, Montréal, QC",
    "200 Rue Jean-Talon Est, Montréal, QC",
    "8500 Boulevard Saint-Michel, Montréal, QC",
    "5000 Chemin de la Côte-des-Neiges, Montréal, QC",
    "3000 Boulevard Décarie, Montréal, QC",
    "6500 Rue Sherbrooke Ouest, Montréal, QC",
    "4000 Rue Notre-Dame Ouest, Montréal, QC",
    "2500 Rue Centre, Montréal, QC",
    "1500 Rue Wellington, Montréal, QC",
    "6900 Boulevard LaSalle, Montréal, QC",
    "8000 Boulevard Newman, Montréal, QC",
    "3500 Rue Ontario Est, Montréal, QC",
    "2200 Rue Sainte-Catherine Est, Montréal, QC",
    "4900 Rue Beaubien Est, Montréal, QC",
    "6300 Rue Saint-Hubert, Montréal, QC",
    "7500 Boulevard Saint-Laurent, Montréal, QC",
    "9000 Boulevard Pie-IX, Montréal, QC",
    "5000 Rue Jean-Talon Est, Montréal, QC",
    "8200 Boulevard Langelier, Montréal, QC",
    "10800 Rue Lajeunesse, Montréal, QC",
    "1200 Boulevard Henri-Bourassa Est, Montréal, QC",
    "2000 Boulevard Gouin Est, Montréal, QC",
    "1400 Avenue Van Horne, Montréal, QC",
    "1100 Avenue Laurier Ouest, Montréal, QC",
    "3700 Rue University, Montréal, QC",
    "2100 Rue Guy, Montréal, QC",
    "4600 Rue Sherbrooke Ouest, Montréal, QC",
]

FIRST_NAMES = [
    "Olivier", "Camille", "Léa", "Gabriel", "Alice", "Noah", "Zoé", "Mathis",
    "Charlotte", "Émile", "Rosalie", "Liam", "Florence", "Nathan", "Juliette",
    "Xavier", "Chloé", "Samuel", "Laurence", "Antoine", "Béatrice", "Félix",
    "Mia", "Thomas", "Ophélie", "William", "Sophie", "Édouard", "Clara", "Victor",
    "Adèle", "Simon", "Léonie", "Hugo", "Éléonore", "Alexis", "Rose",
]


def seed_event(client: httpx.Client, direction: str, frontend_url: str) -> None:
    event = client.post(
        "/events",
        json={
            "name": f"Démo {direction} — 30 passagers (adresses réelles)",
            "direction": direction,
            "depot_address": DEPOT_ADDRESS,
        },
    ).raise_for_status().json()
    event_id = event["id"]

    names = iter(FIRST_NAMES)

    for address, seats in DRIVERS:
        name = next(names)
        try:
            client.post(
                f"/events/{event_id}/drivers",
                json={"name": f"{name} ({seats} places)", "seats": seats, "address": address},
            ).raise_for_status()
        except httpx.HTTPStatusError as exc:
            print(f"  ! conducteur {name!r} ({address}) : {exc.response.text}")

    for address in PASSENGER_ADDRESSES:
        name = next(names)
        try:
            client.post(
                f"/events/{event_id}/passengers",
                json={"name": name, "address": address},
            ).raise_for_status()
        except httpx.HTTPStatusError as exc:
            print(f"  ! passager {name!r} ({address}) : {exc.response.text}")

    print(f"{direction:>10} : {frontend_url}/events/{event_id}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="https://smartcovoit-worker.quentinmeyer57570.workers.dev")
    parser.add_argument("--frontend-url", default="https://smartcovoit.qmeyer.fr")
    args = parser.parse_args()

    # Géocodage réel côté serveur = plus lent qu'un simple CRUD : marge large.
    with httpx.Client(base_url=args.api_url, timeout=30.0) as client:
        for direction in ("ramassage", "dispersion"):
            seed_event(client, direction, args.frontend_url)


if __name__ == "__main__":
    main()
