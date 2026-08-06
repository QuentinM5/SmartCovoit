"""Compose OSRM et Haversine : le repli est transparent, jamais une erreur.

C'est le seul provider que le reste de l'app doit connaître — il décide
lui-même s'il interroge OSRM ou s'en passe, et journalise la raison à
chaque bascule pour que ce soit visible en exploitation sans être une
alerte (le brief est explicite : "transparent et loggé, pas une erreur").
"""

from __future__ import annotations

import logging

from app.distance.haversine import HaversineProvider
from app.distance.osrm import OSRMError, OSRMProvider
from app.distance.types import Coord, MatrixProvider, MatrixResult, Polyline

logger = logging.getLogger(__name__)


class FallbackMatrixProvider:
    """OSRM en priorité, repli automatique sur Haversine.

    Si `osrm` est `None` (OSRM_URL vide en config), on va directement sur
    Haversine sans warning : c'est une configuration assumée, pas une panne.
    """

    def __init__(self, osrm: OSRMProvider | None, haversine: MatrixProvider | None = None) -> None:
        self.osrm = osrm
        self.haversine = haversine or HaversineProvider()

    async def matrix(self, coords: list[Coord]) -> MatrixResult:
        if self.osrm is None:
            return await self.haversine.matrix(coords)

        try:
            return await self.osrm.matrix(coords)
        except OSRMError as exc:
            logger.warning("Repli sur Haversine (OSRM indisponible) : %s", exc)
            result = await self.haversine.matrix(coords)
            return MatrixResult(
                distances=result.distances,
                source="haversine",
                fallback_reason=str(exc),
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
