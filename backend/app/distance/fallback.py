"""Compose Google Routes, OSRM et Haversine : le repli est transparent,
jamais une erreur.

C'est le seul provider que le reste de l'app doit connaître — il décide
lui-même quel niveau interroger, et journalise la raison à chaque bascule
pour que ce soit visible en exploitation sans être une alerte (le brief
est explicite : "transparent et loggé, pas une erreur").

Trois niveaux, du plus précis au plus universel : Google Routes (trafic
temps réel, optionnel et payant) -> OSRM (durée/distance typiques,
gratuit) -> Haversine (à vol d'oiseau, toujours disponible).
"""

from __future__ import annotations

import logging

from app.distance.google_routes import GoogleRoutesError, GoogleRoutesProvider
from app.distance.haversine import HaversineProvider
from app.distance.osrm import OSRMError, OSRMProvider
from app.distance.types import Coord, MatrixProvider, MatrixResult, Polyline

logger = logging.getLogger(__name__)


class FallbackMatrixProvider:
    """Google Routes en priorité si configuré, puis OSRM, puis Haversine.

    Chaque niveau absent (`google`/`osrm` à `None`) est sauté silencieusement
    — c'est une configuration assumée, pas une panne. Seul un niveau
    *configuré mais en échec* déclenche un `WARNING` et une bascule.
    """

    def __init__(
        self,
        osrm: OSRMProvider | None,
        haversine: MatrixProvider | None = None,
        google: GoogleRoutesProvider | None = None,
    ) -> None:
        self.google = google
        self.osrm = osrm
        self.haversine = haversine or HaversineProvider()

    async def matrix(self, coords: list[Coord]) -> MatrixResult:
        last_error: str | None = None

        if self.google is not None:
            try:
                return await self.google.matrix(coords)
            except GoogleRoutesError as exc:
                logger.warning("Repli sur OSRM (Google Routes indisponible) : %s", exc)
                last_error = str(exc)

        if self.osrm is not None:
            try:
                return await self.osrm.matrix(coords)
            except OSRMError as exc:
                logger.warning("Repli sur Haversine (OSRM indisponible) : %s", exc)
                last_error = str(exc)

        result = await self.haversine.matrix(coords)
        return MatrixResult(
            distances=result.distances,
            source="haversine",
            fallback_reason=last_error,
        )

    async def route_geometry(self, coords: list[Coord]) -> Polyline | None:
        """Tracé routier réel, ou `None` si indisponible.

        Purement décoratif : sans OSRM la carte relie les arrêts en ligne
        droite, ce qui reste juste sur l'ordre de passage. Un échec ici ne doit
        donc jamais faire échouer un calcul de tournées.
        """
        if self.osrm is None:
            return None

        try:
            return await self.osrm.route_geometry(coords)
        except OSRMError as exc:
            logger.warning("Tracé routier indisponible, lignes droites : %s", exc)
            return None
