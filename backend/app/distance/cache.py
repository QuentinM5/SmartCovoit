"""Cache mémoire, TTL court, autour d'un provider de matrices.

`move-stop` relance une matrice à CHAQUE glisser-déposer (cf. routes.py
`_reinsert_passenger`/`_recompute_fixed_order`), sur un ensemble de
coordonnées qui n'a le plus souvent pas changé depuis l'appel précédent (on
déplace un passager, pas tout le monde). Sans ce cache, chaque geste refait
payer le niveau Mapbox pour rien.

Volontairement simple : un dict en mémoire, par process, sans verrou -- deux
requêtes concurrentes sur une clé absente peuvent chacune déclencher un
calcul, c'est un doublon occasionnel, pas une incohérence. Pas de migration,
pas de dépendance nouvelle. Un cache partagé (Postgres, comme
`geocode_cache_repo.py`) serait le bon geste si les deux instances backend
avaient besoin de se le partager, mais servent des matrices différentes
(événements différents) le plus souvent -- inutile ici.
"""

from __future__ import annotations

import time

from app.distance.types import Coord, MatrixProviderWithGeometry, MatrixResult, Polyline

# Arrondi à ~5 m (0.00005° de latitude) : suffisant pour reconnaître "les
# mêmes coordonnées" d'un appel à l'autre sans jamais confondre deux adresses
# distinctes.
_COORD_PRECISION = 5


def _cache_key(coords: list[Coord]) -> tuple[tuple[float, float], ...]:
    return tuple((round(c.lat, _COORD_PRECISION), round(c.lon, _COORD_PRECISION)) for c in coords)


class CachedMatrixProvider:
    """Décore un `MatrixProviderWithGeometry` : mémorise le résultat de
    `matrix()` par ensemble de coordonnées pendant `ttl_s`. `route_geometry`
    n'est pas caché -- appelé une seule fois par tournée retenue, jamais en
    boucle comme `matrix()`.
    """

    def __init__(self, inner: MatrixProviderWithGeometry, ttl_s: float) -> None:
        self.inner = inner
        self.ttl_s = ttl_s
        self._cache: dict[tuple[tuple[float, float], ...], tuple[float, MatrixResult]] = {}

    async def matrix(self, coords: list[Coord]) -> MatrixResult:
        key = _cache_key(coords)
        cached = self._cache.get(key)
        now = time.monotonic()
        if cached is not None and cached[0] > now:
            return cached[1]

        result = await self.inner.matrix(coords)
        self._cache[key] = (now + self.ttl_s, result)
        return result

    async def route_geometry(self, coords: list[Coord]) -> Polyline | None:
        return await self.inner.route_geometry(coords)
