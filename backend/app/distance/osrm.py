"""Client OSRM : matrice de distances (`table`) et tracé routier (`route`).

Ne décide jamais de replier sur Haversine lui-même — il échoue simplement
(exception) et laisse `FallbackMatrixProvider` (fallback.py) gérer la
transition. Ça garde une seule responsabilité par classe et un seul endroit
où le repli est décidé et loggé.
"""

from __future__ import annotations

import httpx

from app.distance.types import Coord, MatrixResult, Polyline


class OSRMError(Exception):
    """Toute défaillance OSRM : injoignable, timeout, réponse invalide ou paire non routable."""


class OSRMProvider:
    def __init__(self, base_url: str, timeout_s: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s

    async def matrix(self, coords: list[Coord]) -> MatrixResult:
        if len(coords) < 2:
            return MatrixResult(distances=[[0] * len(coords) for _ in coords], source="osrm")

        coord_str = ";".join(f"{c.lon},{c.lat}" for c in coords)
        url = f"{self.base_url}/table/v1/driving/{coord_str}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                response = await client.get(url, params={"annotations": "distance"})
        except httpx.HTTPError as exc:
            raise OSRMError(f"OSRM injoignable ({self.base_url}) : {exc}") from exc

        if response.status_code != 200:
            raise OSRMError(f"OSRM a répondu {response.status_code} sur {url}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise OSRMError("Réponse OSRM non JSON") from exc

        distances = payload.get("distances")
        if distances is None:
            raise OSRMError(f"Réponse OSRM sans champ 'distances' (code={payload.get('code')})")

        n = len(coords)
        if len(distances) != n or any(len(row) != n for row in distances):
            raise OSRMError("Matrice OSRM de dimensions inattendues")

        result: list[list[int]] = []
        for i, row in enumerate(distances):
            out_row: list[int] = []
            for j, value in enumerate(row):
                if value is None:
                    raise OSRMError(f"Paire ({i}, {j}) non routable par OSRM")
                out_row.append(round(value))
            result.append(out_row)

        return MatrixResult(distances=result, source="osrm")

    async def route_geometry(self, coords: list[Coord]) -> Polyline:
        """Tracé routier réel passant par `coords` dans l'ordre donné.

        Sert uniquement à l'affichage : les distances font foi côté solveur et
        viennent de `matrix()`. `overview=simplified` suffit largement pour une
        carte et évite de transporter des milliers de points par tournée.
        """
        if len(coords) < 2:
            return []

        coord_str = ";".join(f"{c.lon},{c.lat}" for c in coords)
        url = f"{self.base_url}/route/v1/driving/{coord_str}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                response = await client.get(
                    url, params={"overview": "simplified", "geometries": "geojson"}
                )
        except httpx.HTTPError as exc:
            raise OSRMError(f"OSRM injoignable ({self.base_url}) : {exc}") from exc

        if response.status_code != 200:
            raise OSRMError(f"OSRM a répondu {response.status_code} sur {url}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise OSRMError("Réponse OSRM non JSON") from exc

        routes = payload.get("routes") or []
        if not routes:
            raise OSRMError(f"Aucun tracé renvoyé par OSRM (code={payload.get('code')})")

        coordinates = (routes[0].get("geometry") or {}).get("coordinates")
        if not coordinates:
            raise OSRMError("Tracé OSRM sans coordonnées")

        # GeoJSON est en (lon, lat) ; le reste de l'app raisonne en (lat, lon).
        return [[float(lat), float(lon)] for lon, lat in coordinates]
