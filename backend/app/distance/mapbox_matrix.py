"""Client Mapbox Matrix API (`directions-matrix`) — durées et distances
routières, sans trafic (profil `driving`).

Niveau de repli entre OSRM et Haversine (cf. fallback.py) : sert quand OSRM
n'est pas disponible sur l'instance (le secours Heroku, sans NAS ni données
OSRM locales). N'existe que si `MAPBOX_ACCESS_TOKEN` est configuré — c'est
`FallbackMatrixProvider` qui décide de l'utiliser ou non.

Le profil `driving-traffic` (avec trafic) plafonne à 10 coordonnées par
requête, contre 25 pour `driving` — une matrice de 41 nœuds (40 participants
+ dépôt) en `driving-traffic` demanderait ~68 requêtes séquencées à 30/min,
largement au-delà du budget temps d'un /solve. Le trafic est donc obtenu
ailleurs (cf. mapbox_directions.py, un appel par tournée finale), et ce
provider reste sur `driving` : une matrice de durées et distances typiques,
comme OSRM.
"""

from __future__ import annotations

import asyncio

import httpx

from app.distance.types import Coord, MatrixResult

_ENDPOINT = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving"

# Limite Mapbox : 25 coordonnées par requête (profil driving). Un bloc de
# 12 origines x 13 destinations = 25 coordonnées uniques envoyées à l'API
# (elle prend une seule liste de coordonnées, plus des indices sources/
# destinations dedans) -- cf. _request_block.
_MAX_CHUNK = 12


class MapboxMatrixError(Exception):
    """Toute défaillance Mapbox Matrix : injoignable, quota, jeton invalide, paire non routable."""


def _chunk_ranges(n: int, size: int) -> list[range]:
    return [range(i, min(i + size, n)) for i in range(0, n, size)]


class MapboxMatrixProvider:
    def __init__(self, access_token: str, timeout_s: float = 15.0) -> None:
        self.access_token = access_token
        self.timeout_s = timeout_s

    async def matrix(self, coords: list[Coord]) -> MatrixResult:
        n = len(coords)
        if n < 2:
            empty = [[0] * n for _ in range(n)]
            return MatrixResult(distances=empty, durations=empty, source="mapbox")

        distances = [[0] * n for _ in range(n)]
        durations = [[0] * n for _ in range(n)]
        filled = [[False] * n for _ in range(n)]

        origin_chunks = _chunk_ranges(n, _MAX_CHUNK)
        dest_chunks = _chunk_ranges(n, _MAX_CHUNK)

        async with httpx.AsyncClient(timeout=self.timeout_s) as client:
            blocks = await asyncio.gather(
                *(
                    self._request_block(client, coords, o_chunk, d_chunk)
                    for o_chunk in origin_chunks
                    for d_chunk in dest_chunks
                ),
                return_exceptions=True,
            )

        for block in blocks:
            if isinstance(block, MapboxMatrixError):
                raise block
            if isinstance(block, BaseException):
                raise MapboxMatrixError(str(block)) from block
            for i, j, distance_m, duration_s in block:
                distances[i][j] = distance_m
                durations[i][j] = duration_s
                filled[i][j] = True

        missing = next(
            ((i, j) for i in range(n) for j in range(n) if i != j and not filled[i][j]), None
        )
        if missing is not None:
            raise MapboxMatrixError(f"Paire {missing} manquante dans la réponse Mapbox Matrix")

        return MatrixResult(distances=distances, durations=durations, source="mapbox")

    async def _request_block(
        self,
        client: httpx.AsyncClient,
        coords: list[Coord],
        origin_range: range,
        dest_range: range,
    ) -> list[tuple[int, int, int, int]]:
        origin_list = list(origin_range)
        dest_list = list(dest_range)

        # Mapbox prend une seule liste de coordonnées dans l'URL, puis des
        # index `sources`/`destinations` dedans -- contrairement à Google qui
        # accepte deux listes séparées. On construit donc une liste locale
        # dédupliquée (origines d'abord, puis destinations qui n'y sont pas
        # déjà) et on retrouve l'index global via origin_list/dest_list.
        local_coords: list[Coord] = [coords[i] for i in origin_list]
        local_index: dict[int, int] = {i: k for k, i in enumerate(origin_list)}
        for j in dest_list:
            if j not in local_index:
                local_index[j] = len(local_coords)
                local_coords.append(coords[j])

        coord_str = ";".join(f"{c.lon},{c.lat}" for c in local_coords)
        url = f"{_ENDPOINT}/{coord_str}"
        params = {
            "sources": ";".join(str(local_index[i]) for i in origin_list),
            "destinations": ";".join(str(local_index[j]) for j in dest_list),
            "annotations": "duration,distance",
            "access_token": self.access_token,
        }

        try:
            response = await client.get(url, params=params)
        except httpx.HTTPError as exc:
            raise MapboxMatrixError(f"Mapbox Matrix injoignable : {exc}") from exc

        if response.status_code != 200:
            raise MapboxMatrixError(
                f"Mapbox Matrix a répondu {response.status_code} : {response.text[:300]}"
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise MapboxMatrixError("Réponse Mapbox Matrix non JSON") from exc

        if payload.get("code") != "Ok":
            raise MapboxMatrixError(f"Mapbox Matrix : {payload.get('code')} {payload.get('message', '')}")

        raw_distances = payload.get("distances")
        raw_durations = payload.get("durations")
        if raw_distances is None or raw_durations is None:
            raise MapboxMatrixError("Réponse Mapbox Matrix sans 'distances' ou 'durations'")

        out: list[tuple[int, int, int, int]] = []
        for oi, i in enumerate(origin_list):
            for oj, j in enumerate(dest_list):
                distance_m = raw_distances[oi][oj]
                duration_s = raw_durations[oi][oj]
                if distance_m is None or duration_s is None:
                    continue  # paire non routable -- comptera comme manquante plus haut
                out.append((i, j, round(distance_m), round(duration_s)))
        return out
