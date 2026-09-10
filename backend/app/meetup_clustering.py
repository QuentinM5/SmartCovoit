"""Regroupement géométrique des arrêts proches d'une tournée — cf. plan
(« points de rassemblement intelligents »). Fonction pure, testable sans
base de données ni réseau, même esprit que app.impact.

Ce module ne connaît PAS Google Places : il se contente de dire quels
arrêts sont assez proches pour être candidats à un regroupement. C'est la
route (GET /events/{id}/solution/meetup-suggestions) qui interroge ensuite
Places pour un vrai lieu autour du centroïde de chaque groupe trouvé ici.
"""

from __future__ import annotations

from typing import TypeVar

from app.distance.haversine import haversine_m
from app.distance.types import Coord

# Rayon de regroupement — cf. demande initiale ("passagers à moins de 2 km").
DEFAULT_CLUSTER_RADIUS_M = 2000

T = TypeVar("T")


def cluster_nearby_stops(
    stops: list[tuple[T, Coord]], radius_m: float = DEFAULT_CLUSTER_RADIUS_M
) -> list[list[tuple[T, Coord]]]:
    """Regroupement glouton : chaque groupe part d'un arrêt encore libre et
    y rattache tout arrêt restant à moins de `radius_m` de CET arrêt (pas du
    centroïde du groupe en formation — plus simple, suffisant à l'échelle
    d'une tournée de quelques dizaines d'arrêts, et le comportement attendu
    reste correct même si le résultat n'est pas un optimum géométrique
    global). Ne renvoie que les groupes d'au moins deux arrêts : un arrêt
    seul n'a rien à regrouper."""
    remaining = list(stops)
    groups: list[list[tuple[T, Coord]]] = []

    while remaining:
        seed_id, seed_coord = remaining.pop(0)
        group = [(seed_id, seed_coord)]
        still_remaining: list[tuple[T, Coord]] = []
        for item in remaining:
            if haversine_m(seed_coord, item[1]) <= radius_m:
                group.append(item)
            else:
                still_remaining.append(item)
        remaining = still_remaining
        groups.append(group)

    return [g for g in groups if len(g) >= 2]


def centroid(coords: list[Coord]) -> Coord:
    """Moyenne simple des latitudes/longitudes — suffisant pour centrer une
    recherche Google Places sur un petit groupe de points proches ; pas
    destiné à des distances continentales où cette moyenne naïve dérive."""
    return Coord(
        lat=sum(c.lat for c in coords) / len(coords),
        lon=sum(c.lon for c in coords) / len(coords),
    )
