"""Crée deux événements de démo (ramassage + dispersion) via l'API réelle :
30 passagers, 5 conducteurs 5 places, 2 conducteurs 7 places (37 places pour
30 passagers, de la marge pour que le solveur ait un vrai choix à faire).

Coordonnées envoyées directement (lat/lon), jamais un géocodage Nominatim
par personne — c'est ce qui rend le script rapide (39 inscriptions en
quelques secondes) et déterministe (`--seed`). Les positions sont dispersées
autour d'un centre réel (Montréal par défaut) dans un rayon plausible pour du
covoiturage, pour que le solveur et le tracé OSRM produisent des tournées qui
ont du sens à l'œil.

Usage :
    .venv/Scripts/python.exe scripts/seed_demo_event.py
    .venv/Scripts/python.exe scripts/seed_demo_event.py --api-url http://localhost:8000
"""

from __future__ import annotations

import argparse
import math
import random

import httpx

DEPOT = {"name": "Place Ville Marie", "lat": 45.5017, "lon": -73.5673}
SPREAD_RADIUS_KM = 15.0

DRIVER_SEAT_COUNTS = [5, 5, 5, 5, 5, 7, 7]  # 5 voitures 5 places + 2 voitures 7 places
PASSENGER_COUNT = 30

FIRST_NAMES = [
    "Olivier", "Camille", "Léa", "Gabriel", "Alice", "Noah", "Zoé", "Mathis",
    "Charlotte", "Émile", "Rosalie", "Liam", "Florence", "Nathan", "Juliette",
    "Xavier", "Chloé", "Samuel", "Laurence", "Antoine", "Béatrice", "Félix",
    "Mia", "Thomas", "Ophélie", "William", "Sophie", "Édouard", "Clara", "Victor",
    "Adèle", "Simon", "Léonie", "Hugo", "Éléonore", "Alexis", "Rose",
]


def jittered_coord(rng: random.Random, center_lat: float, center_lon: float, radius_km: float) -> dict:
    """Point aléatoire uniforme dans un disque de `radius_km` autour du centre."""
    distance_km = radius_km * math.sqrt(rng.random())
    angle = rng.uniform(0, 2 * math.pi)
    lat = center_lat + (distance_km / 111.0) * math.cos(angle)
    lon = center_lon + (distance_km / (111.0 * math.cos(math.radians(center_lat)))) * math.sin(angle)
    return {"lat": round(lat, 6), "lon": round(lon, 6)}


def seed_event(client: httpx.Client, rng: random.Random, direction: str, frontend_url: str) -> None:
    event = client.post(
        "/events",
        json={
            "name": f"Démo {direction} — {PASSENGER_COUNT} passagers",
            "direction": direction,
            "depot_address": DEPOT["name"],
            "lat": DEPOT["lat"],
            "lon": DEPOT["lon"],
        },
    ).raise_for_status().json()
    event_id = event["id"]

    names = rng.sample(FIRST_NAMES * 2, PASSENGER_COUNT + len(DRIVER_SEAT_COUNTS))
    name_iter = iter(names)

    for i, seats in enumerate(DRIVER_SEAT_COUNTS):
        coord = jittered_coord(rng, DEPOT["lat"], DEPOT["lon"], SPREAD_RADIUS_KM)
        client.post(
            f"/events/{event_id}/drivers",
            json={
                "name": f"{next(name_iter)} ({seats} places)",
                "seats": seats,
                "address": f"Adresse démo conducteur {i + 1}, Montréal, QC",
                **coord,
            },
        ).raise_for_status()

    for i in range(PASSENGER_COUNT):
        coord = jittered_coord(rng, DEPOT["lat"], DEPOT["lon"], SPREAD_RADIUS_KM)
        client.post(
            f"/events/{event_id}/passengers",
            json={
                "name": next(name_iter),
                "address": f"Adresse démo passager {i + 1}, Montréal, QC",
                **coord,
            },
        ).raise_for_status()

    print(f"{direction:>10} : {frontend_url}/events/{event_id}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="https://smartcovoit-worker.quentinmeyer57570.workers.dev")
    parser.add_argument("--frontend-url", default="https://smartcovoit-frontend.quentinmeyer57570.workers.dev")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    with httpx.Client(base_url=args.api_url, timeout=30.0) as client:
        for direction in ("ramassage", "dispersion"):
            # Même graine par direction : les deux événements ont les mêmes
            # positions, seul le sens du trajet change — pratique pour
            # comparer les tournées produites sur des données identiques.
            seed_event(client, random.Random(args.seed), direction, args.frontend_url)


if __name__ == "__main__":
    main()
