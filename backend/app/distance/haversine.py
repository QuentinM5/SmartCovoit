"""Distance à vol d'oiseau — repli quand OSRM n'est pas disponible.

Toujours utilisable (calcul pur, pas de réseau), donc le service de matrice
de distances peut *toujours* répondre, même sans OSRM configuré.
"""

from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

from app.distance.types import Coord, MatrixResult

EARTH_RADIUS_M = 6_371_000


def haversine_m(a: Coord, b: Coord) -> int:
    """Distance à vol d'oiseau entre deux coordonnées, en mètres (entier)."""
    lat1, lon1, lat2, lon2 = map(radians, (a.lat, a.lon, b.lat, b.lon))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return round(2 * EARTH_RADIUS_M * asin(sqrt(h)))


class HaversineProvider:
    """Provider de secours : matrice complète calculée localement, sans réseau.

    `road_factor` permet d'appliquer un facteur de sinuosité uniforme pour que
    les distances affichées se rapprochent de distances routières réelles.
    Par défaut à 1.0 : un facteur uniforme ne change pas la tournée optimale
    (c'est un multiplicateur constant sur tous les arcs), seulement les
    kilomètres affichés — pas de fausse précision tant qu'il n'est pas réglé
    explicitement.
    """

    def __init__(self, road_factor: float = 1.0) -> None:
        self.road_factor = road_factor

    async def matrix(self, coords: list[Coord]) -> MatrixResult:
        n = len(coords)
        distances = [[0] * n for _ in range(n)]
        for i in range(n):
            for j in range(i + 1, n):
                d = round(haversine_m(coords[i], coords[j]) * self.road_factor)
                distances[i][j] = d
                distances[j][i] = d
        return MatrixResult(distances=distances, source="haversine")
