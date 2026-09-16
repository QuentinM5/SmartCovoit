"""Client Mapbox Directions API (`driving-traffic`) — durée avec trafic et
tracé routier d'UNE tournée déjà décidée par le solveur.

Le solveur affecte les passagers sur une matrice sans trafic (cf.
mapbox_matrix.py, mapbox-matrix ou OSRM) : sous congestion à peu près
uniforme, l'ordre relatif des candidats change peu, donc le trafic n'a pas
besoin d'être connu pour bien affecter. Il se voit en revanche sur l'heure de
départ affichée à l'utilisateur — d'où un appel Directions, par tournée
retenue, une fois la solution figée.

`driving-traffic` accepte jusqu'à 25 points par requête (une tournée typique
en fait beaucoup moins : dépôt + quelques passagers), et est facturé à la
requête, pas à l'élément — sans commune mesure avec une matrice complète.

Un échec ici (quota, jeton invalide, réseau) ne doit jamais faire échouer un
calcul de tournées : l'appelant retombe sur la durée déjà connue côté
solveur, comme pour la géométrie OSRM (cf. fallback.py).
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.distance.types import Coord, Polyline

_ENDPOINT = "https://api.mapbox.com/directions/v5/mapbox/driving-traffic"


class MapboxDirectionsError(Exception):
    """Toute défaillance Mapbox Directions : injoignable, quota, jeton invalide, aucun tracé."""


@dataclass(frozen=True)
class TrafficRoute:
    """Durée avec trafic (secondes) et tracé routier d'une tournée."""

    duration_s: int
    geometry: Polyline


class MapboxDirectionsProvider:
    def __init__(self, access_token: str, timeout_s: float = 15.0) -> None:
        self.access_token = access_token
        self.timeout_s = timeout_s

    async def route(self, coords: list[Coord]) -> TrafficRoute:
        if len(coords) < 2:
            return TrafficRoute(duration_s=0, geometry=[])

        coord_str = ";".join(f"{c.lon},{c.lat}" for c in coords)
        url = f"{_ENDPOINT}/{coord_str}"
        params = {
            "geometries": "geojson",
            "overview": "simplified",
            # Sans departure_time explicite, driving-traffic se rabat sur des
            # segments à trafic historique moyenné plutôt que la situation
            # actuelle -- "now" déclenche la prise en compte du trafic live,
            # même logique que Google Routes (cf. google_routes.py) mais sans
            # exigence d'horodatage futur ici.
            "depart_at": "now",
            "access_token": self.access_token,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                response = await client.get(url, params=params)
        except httpx.HTTPError as exc:
            raise MapboxDirectionsError(f"Mapbox Directions injoignable : {exc}") from exc

        if response.status_code != 200:
            raise MapboxDirectionsError(
                f"Mapbox Directions a répondu {response.status_code} : {response.text[:300]}"
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise MapboxDirectionsError("Réponse Mapbox Directions non JSON") from exc

        if payload.get("code") != "Ok":
            raise MapboxDirectionsError(
                f"Mapbox Directions : {payload.get('code')} {payload.get('message', '')}"
            )

        routes = payload.get("routes") or []
        if not routes:
            raise MapboxDirectionsError("Aucun tracé renvoyé par Mapbox Directions")

        route = routes[0]
        try:
            duration_s = round(route["duration"])
            coordinates = route["geometry"]["coordinates"]
        except (KeyError, TypeError) as exc:
            raise MapboxDirectionsError(f"Tracé Mapbox Directions malformé : {route!r:.200}") from exc

        # GeoJSON est en (lon, lat) ; le reste de l'app raisonne en (lat, lon).
        geometry = [[float(lat), float(lon)] for lon, lat in coordinates]
        return TrafficRoute(duration_s=duration_s, geometry=geometry)
