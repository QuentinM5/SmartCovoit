"""Client Google Routes API (`computeRouteMatrix`) — trafic en temps réel, en
option payante par-dessus OSRM.

Contrairement à OSRM, ce provider n'existe que si une clé est configurée
(`GOOGLE_ROUTES_API_KEY`) — c'est `FallbackMatrixProvider` qui décide de
l'utiliser ou non. Toute défaillance (quota, clé invalide, réseau, paire non
routable) lève `GoogleRoutesError` et laisse le niveau suivant (OSRM) prendre
le relais, même philosophie que le repli OSRM -> Haversine déjà en place.

Important : cette clé est distincte de celle du navigateur
(`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, restreinte par domaine HTTP). Celle-ci
tourne côté serveur, n'est jamais exposée au client, et doit rester une
variable d'environnement backend uniquement.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import httpx

from app.distance.types import Coord, MatrixResult

_ENDPOINT = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
_FIELD_MASK = "originIndex,destinationIndex,duration,distanceMeters,condition"

# TRAFFIC_AWARE plafonne à 625 éléments (~25×25) par appel — au-delà, il faut
# découper soi-même et recoller. 24 plutôt que 25 : marge contre un
# arrondi ou un décompte légèrement différent côté Google (24×24=576 < 625).
_MAX_CHUNK = 24


class GoogleRoutesError(Exception):
    """Toute défaillance Google Routes : injoignable, quota, clé invalide, paire non routable."""


def _chunk_ranges(n: int, size: int) -> list[range]:
    return [range(i, min(i + size, n)) for i in range(0, n, size)]


def _parse_duration(value: str) -> int:
    """Format `google.protobuf.Duration` en JSON : `"1234s"` -> 1234."""
    try:
        return round(float(value.rstrip("s")))
    except (ValueError, AttributeError) as exc:
        raise GoogleRoutesError(f"Durée Google Routes illisible : {value!r}") from exc


def _waypoint(coord: Coord) -> dict:
    return {"waypoint": {"location": {"latLng": {"latitude": coord.lat, "longitude": coord.lon}}}}


class GoogleRoutesProvider:
    def __init__(self, api_key: str, timeout_s: float = 15.0) -> None:
        self.api_key = api_key
        self.timeout_s = timeout_s

    async def matrix(self, coords: list[Coord]) -> MatrixResult:
        n = len(coords)
        if n < 2:
            empty = [[0] * n for _ in range(n)]
            return MatrixResult(distances=empty, durations=empty, source="google")

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
            if isinstance(block, GoogleRoutesError):
                raise block
            if isinstance(block, BaseException):
                raise GoogleRoutesError(str(block)) from block
            for i, j, distance_m, duration_s in block:
                distances[i][j] = distance_m
                durations[i][j] = duration_s
                filled[i][j] = True

        # La diagonale (i == j) n'a pas besoin d'être renvoyée par Google : elle
        # est déjà à 0 par construction.
        missing = next(
            ((i, j) for i in range(n) for j in range(n) if i != j and not filled[i][j]), None
        )
        if missing is not None:
            raise GoogleRoutesError(f"Paire {missing} manquante dans la réponse Google Routes")

        return MatrixResult(distances=distances, durations=durations, source="google")

    async def _request_block(
        self,
        client: httpx.AsyncClient,
        coords: list[Coord],
        origin_range: range,
        dest_range: range,
    ) -> list[tuple[int, int, int, int]]:
        origin_list = list(origin_range)
        dest_list = list(dest_range)

        body = {
            "origins": [_waypoint(coords[i]) for i in origin_list],
            "destinations": [_waypoint(coords[j]) for j in dest_list],
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_AWARE",
            # Sans departureTime explicite, TRAFFIC_AWARE renvoie une simple
            # estimation statique malgré son nom — "maintenant" est ce qui
            # déclenche la prise en compte du trafic réel. Google exige
            # strictement un horodatage FUTUR ("Timestamp must be set to a
            # future time.") : `datetime.now()` pile à l'envoi arrive déjà
            # dans le passé une fois la requête reçue (latence réseau, dérive
            # d'horloge du serveur) — d'où une marge de sécurité, sans impact
            # sur la pertinence du trafic pris en compte.
            "departureTime": (datetime.now(timezone.utc) + timedelta(seconds=30)).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            ),
        }

        try:
            response = await client.post(
                _ENDPOINT,
                json=body,
                headers={"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": _FIELD_MASK},
            )
        except httpx.HTTPError as exc:
            raise GoogleRoutesError(f"Google Routes injoignable : {exc}") from exc

        if response.status_code != 200:
            raise GoogleRoutesError(
                f"Google Routes a répondu {response.status_code} : {response.text[:300]}"
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise GoogleRoutesError("Réponse Google Routes non JSON") from exc

        if isinstance(payload, dict) and "error" in payload:
            raise GoogleRoutesError(f"Google Routes : {payload['error']}")
        if not isinstance(payload, list):
            raise GoogleRoutesError(f"Réponse Google Routes de forme inattendue : {payload!r:.200}")

        out: list[tuple[int, int, int, int]] = []
        for element in payload:
            try:
                if element.get("condition") != "ROUTE_EXISTS":
                    continue  # comptera comme manquant plus haut, pas une erreur isolée
                i = origin_list[element["originIndex"]]
                j = dest_list[element["destinationIndex"]]
                # `distanceMeters` est un entier proto3 : à 0 (la diagonale
                # origine == destination, ou deux points à la même position),
                # la sérialisation JSON de protobuf omet le champ plutôt que
                # d'envoyer `0` explicitement — absent ne veut donc pas dire
                # malformé ici, contrairement à originIndex/destinationIndex.
                distance_m = int(element.get("distanceMeters", 0))
                duration_s = _parse_duration(element["duration"])
            except (KeyError, IndexError, TypeError) as exc:
                raise GoogleRoutesError(f"Élément Google Routes malformé : {element!r:.200}") from exc
            out.append((i, j, distance_m, duration_s))
        return out
