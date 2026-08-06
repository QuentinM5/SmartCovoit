"""Démo manuelle du solveur sur un scénario réaliste, données en dur.

But : vérifier à l'œil que les tournées produites ont du sens, avant de
brancher l'API dessus. Pas un test automatisé — lancer avec :

    .venv/Scripts/python.exe scripts/demo_solver.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.distance.haversine import haversine_m
from app.distance.types import Coord
from app.solver.model import Direction, DriverSpec, PassengerSpec, SolveRequest
from app.solver.vrp import solve

# Dépôt : place centrale d'une ville fictive. Le reste : adresses dispersées
# autour, à des distances raisonnables (quelques km).
DEPOT = Coord(48.8566, 2.3522)  # Paris, Place de l'Hôtel de Ville

DRIVER_COORDS = [
    Coord(48.8738, 2.2950),  # Arc de Triomphe
    Coord(48.8417, 2.3234),  # Denfert-Rochereau
    Coord(48.8462, 2.3897),  # Nation
]
PASSENGER_COORDS = [
    Coord(48.8867, 2.3431),  # Montmartre
    Coord(48.8656, 2.3212),  # Trocadéro
    Coord(48.8323, 2.3559),  # Place d'Italie
    Coord(48.8630, 2.3708),  # République
    Coord(48.8496, 2.3739),  # Bastille
    Coord(48.8709, 2.3320),  # Gare Saint-Lazare
    Coord(48.8398, 2.2770),  # Porte de Saint-Cloud
]

DRIVER_SEATS = [3, 3, 2]  # total 8 places pour 7 passagers


def build_matrix(coords: list[Coord]) -> list[list[int]]:
    n = len(coords)
    return [[haversine_m(coords[i], coords[j]) for j in range(n)] for i in range(n)]


def run(direction: Direction) -> None:
    all_coords = [DEPOT, *DRIVER_COORDS, *PASSENGER_COORDS]
    matrix = build_matrix(all_coords)

    drivers = [
        DriverSpec(id=f"d{i}", name=f"Conducteur {i + 1}", seats=seats, node=1 + i)
        for i, seats in enumerate(DRIVER_SEATS)
    ]
    passengers = [
        PassengerSpec(id=f"p{i}", name=f"Passager {i + 1}", node=1 + len(drivers) + i)
        for i in range(len(PASSENGER_COORDS))
    ]

    request = SolveRequest(
        direction=direction,
        distance_matrix=matrix,
        drivers=drivers,
        passengers=passengers,
    )
    solution = solve(request)

    print(f"\n=== {direction.value} ===")
    for route in solution.routes:
        stop_labels = []
        for stop in route.stops:
            if stop.passenger_id is None:
                label = "Dépôt" if stop.node == 0 else f"Domicile[{route.driver_name}]"
            else:
                label = next(p.name for p in passengers if p.id == stop.passenger_id)
            stop_labels.append(f"{label} ({stop.cumulative_distance_m} m)")
        print(f"{route.driver_name} ({len(route.passenger_ids)} passager(s)): " + " -> ".join(stop_labels))
    print(f"Distance totale : {solution.total_distance_m} m ({solution.total_distance_m / 1000:.1f} km)")


if __name__ == "__main__":
    run(Direction.RAMASSAGE)
    run(Direction.DISPERSION)
