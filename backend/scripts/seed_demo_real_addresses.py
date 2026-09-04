"""Recrée un compte de démo et deux événements de test contre l'API réelle,
avec de VRAIES adresses géocodées côté serveur (Nominatim) — comme le ferait
un vrai formulaire, contrairement à `seed_demo_event.py` qui envoie des
coordonnées toutes faites pour aller vite.

Réécrit pour le modèle actuel (authentification obligatoire, sens du trajet
par inscription plutôt que par événement, cf. migrations 0002/0003) — la
version précédente de ce script datait d'avant l'un et l'autre.

Pensé pour tourner juste après `reset_db.py` : la base est vide, ce script
crée le seul compte qui existera et les deux événements de test.

- Événement « réel » : 40 personnes (7 conducteurs + 33 passagers), inscrites
  À LA FOIS à l'aller et au retour (aller = ramassage, retour = dispersion),
  donc 40 inscrits par sens — pile sous le plafond de Settings.max_participants_per_event,
  compté par sens depuis le correctif de la migration 0007.
- Événement « cas limites » : surcapacité volontaire (1 place, 3 passagers),
  aucun conducteur au retour, un passager à l'adresse exacte du dépôt
  (distance nulle), deux passagers à la même adresse, un passager très
  éloigné (Québec), un nom long et accentué, une description à ponctuation
  piégeuse pour l'export .ics, et un barème/devise personnalisés (CHF).

Plus lent qu'un simple CRUD (géocodage limité à 1 req/s côté serveur, cf.
NominatimClient) : compter 2-3 minutes pour l'ensemble.

Usage :
    .venv/Scripts/python.exe scripts/reset_db.py --yes-i-am-sure
    .venv/Scripts/python.exe scripts/seed_demo_real_addresses.py
"""

from __future__ import annotations

import argparse

import httpx

DEMO_EMAIL = "organisateur@example.com"
DEMO_PASSWORD = "covoiturage-demo-2026"
DEMO_NAME = "Organisateur Démo"

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
    "1000 Rue Saint-Antoine Ouest, Montréal, QC",
    "3800 Rue Saint-Urbain, Montréal, QC",
    "5600 Avenue de Gaspé, Montréal, QC",
]

FIRST_NAMES = [
    "Olivier", "Camille", "Léa", "Gabriel", "Alice", "Noah", "Zoé", "Mathis",
    "Charlotte", "Émile", "Rosalie", "Liam", "Florence", "Nathan", "Juliette",
    "Xavier", "Chloé", "Samuel", "Laurence", "Antoine", "Béatrice", "Félix",
    "Mia", "Thomas", "Ophélie", "William", "Sophie", "Édouard", "Clara", "Victor",
    "Adèle", "Simon", "Léonie", "Hugo", "Éléonore", "Alexis", "Rose", "Justine",
    "Raphaël", "Aurélie",
]

EVENT_DATE = "2026-10-17"

DESCRIPTION_WITH_TRICKY_PUNCTUATION = (
    "Départ à 8h précises, prévoir de l'eau; retour vers 18h.\n"
    "Contact: organisateur@example.com,\n"
    "place de stationnement limitée."
)


def authenticate(client: httpx.Client) -> str:
    """Crée (ou réutilise si déjà présent) le compte de démo, renvoie son jeton."""
    try:
        auth = client.post(
            "/auth/signup", json={"email": DEMO_EMAIL, "name": DEMO_NAME, "password": DEMO_PASSWORD}
        ).raise_for_status().json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code != 409:
            raise
        auth = client.post(
            "/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
        ).raise_for_status().json()
    return auth["token"]


def seed_real_event(client: httpx.Client, frontend_url: str) -> None:
    """40 personnes, inscrites à l'aller ET au retour — teste le cas nominal
    à grande échelle, avec de vraies adresses des deux côtés."""
    event = client.post(
        "/events",
        json={
            "name": "Sortie au Mont-Tremblant — 40 personnes",
            "depot_address": DEPOT_ADDRESS,
            "event_date": EVENT_DATE,
            "description": "Covoiturage aller-retour, deux tournées à calculer séparément.",
        },
    ).raise_for_status().json()
    event_id = event["id"]

    names = iter(FIRST_NAMES)
    directions = ["ramassage", "dispersion"]

    for address, seats in DRIVERS:
        name = next(names)
        for direction in directions:
            try:
                client.post(
                    f"/events/{event_id}/drivers",
                    json={
                        "name": f"{name} ({seats} places)",
                        "seats": seats,
                        "address": address,
                        "direction": direction,
                    },
                ).raise_for_status()
            except httpx.HTTPStatusError as exc:
                print(f"  ! conducteur {name!r} ({address}, {direction}) : {exc.response.text}")

    for address in PASSENGER_ADDRESSES:
        name = next(names)
        for direction in directions:
            try:
                client.post(
                    f"/events/{event_id}/passengers",
                    json={"name": name, "address": address, "direction": direction},
                ).raise_for_status()
            except httpx.HTTPStatusError as exc:
                print(f"  ! passager {name!r} ({address}, {direction}) : {exc.response.text}")

    print(f"réel (40 pers., aller+retour) : {frontend_url}/events/{event_id}")


def seed_edge_case_event(client: httpx.Client, frontend_url: str) -> None:
    """Un événement pensé pour faire apparaître les cas limites de l'UI :
    surcapacité, absence de conducteur, distance nulle, adresses dupliquées,
    passager très éloigné, nom long/accentué, ponctuation piégeuse pour
    l'export .ics, et un barème/devise personnalisés."""
    event = client.post(
        "/events",
        json={
            "name": "Cabane à sucre — édition « cas limites »",
            "depot_address": DEPOT_ADDRESS,
            "event_date": EVENT_DATE,
            "description": DESCRIPTION_WITH_TRICKY_PUNCTUATION,
        },
    ).raise_for_status().json()
    event_id = event["id"]

    # Ramassage : un seul conducteur, une seule place, trois passagers —
    # surcapacité volontaire (bandeau rouge, "2 de trop").
    client.post(
        f"/events/{event_id}/drivers",
        json={
            "name": "Étienne (1 place)",
            "seats": 1,
            "address": "3575 Avenue du Parc, Montréal, QC",
            "direction": "ramassage",
        },
    ).raise_for_status()
    client.post(
        f"/events/{event_id}/passengers",
        json={"name": "Noé", "address": "1200 Avenue du Mont-Royal Est, Montréal, QC", "direction": "ramassage"},
    ).raise_for_status()
    # Même adresse que Noé, exprès : deux passagers au même point.
    client.post(
        f"/events/{event_id}/passengers",
        json={"name": "Zoé", "address": "1200 Avenue du Mont-Royal Est, Montréal, QC", "direction": "ramassage"},
    ).raise_for_status()
    # Nom long et accentué + adresse identique au dépôt : distance nulle pour
    # ce passager, et éprouve la troncature/l'échappement des libellés.
    client.post(
        f"/events/{event_id}/passengers",
        json={
            "name": "Amélie-Ève Beauchêne-Larivière",
            "address": DEPOT_ADDRESS,
            "direction": "ramassage",
        },
    ).raise_for_status()

    # Dispersion : aucun conducteur — /solve doit renvoyer 422, l'UI son
    # message "il faut au moins un conducteur". Un passager très éloigné
    # (Québec) pour une tournée hors d'échelle une fois un conducteur ajouté
    # manuellement par qui teste la page.
    client.post(
        f"/events/{event_id}/passengers",
        json={"name": "Gabriel", "address": "1 Rue des Carrières, Québec, QC", "direction": "dispersion"},
    ).raise_for_status()

    # Barème et devise personnalisés — vérifie la chaîne complète du partage
    # de frais avec une devise autre que le défaut.
    client.patch(
        f"/events/{event_id}",
        json={"fuel_price_per_l": 2.1, "consumption_l_per_100km": 9.5, "currency": "CHF"},
    ).raise_for_status()

    print(f"cas limites : {frontend_url}/events/{event_id}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="https://smartcovoit-worker.quentinmeyer57570.workers.dev")
    parser.add_argument("--frontend-url", default="https://smartcovoit.qmeyer.fr")
    args = parser.parse_args()

    # verify=False : contourne l'injection de certificat de Cloudflare WARP
    # sur la machine de dev Windows (root CA locale non reconnue par
    # httpx/certifi) — ce script tourne en local contre une URL de
    # production connue, pas un contexte où la vérification TLS protège
    # contre un tiers réel. Géocodage réel côté serveur = plus lent qu'un
    # simple CRUD : marge large.
    with httpx.Client(base_url=args.api_url, timeout=30.0, verify=False) as client:
        token = authenticate(client)
        client.headers["Authorization"] = f"Bearer {token}"

        seed_real_event(client, args.frontend_url)
        seed_edge_case_event(client, args.frontend_url)

    print(f"\nCompte de démo : {DEMO_EMAIL} / {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
