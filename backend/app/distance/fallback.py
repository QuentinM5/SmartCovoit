"""Compose Google Routes, OSRM, Mapbox et Haversine : le repli est
transparent, jamais une erreur.

C'est le seul provider que le reste de l'app doit connaître — il décide
lui-même quel niveau interroger, et journalise la raison à chaque bascule
pour que ce soit visible en exploitation sans être une alerte (le brief
est explicite : "transparent et loggé, pas une erreur").

Quatre niveaux, du plus précis au plus universel :
- Google Routes (trafic temps réel) -- en sommeil depuis septembre 2026,
  sa clé coupée par décision de facturation (facturation Pro au
  trafic-aware, cf. audit) ; le code reste, désactivé, plutôt que supprimé,
  au cas où il redeviendrait pertinent.
- OSRM (durée/distance typiques, gratuit, mais seulement là où des données
  routières sont installées -- le NAS primaire uniquement).
- Mapbox (durée/distance typiques, payant au-delà d'un quota généreux) --
  ce qui répare le secours (Heroku, sans OSRM) : sans lui, le secours
  retombait directement sur Haversine et le solveur perdait la matrice de
  durées pour minimiser des kilomètres à vol d'oiseau.
- Haversine (à vol d'oiseau, toujours disponible).
"""

from __future__ import annotations

import logging

from app.distance.google_routes import GoogleRoutesError, GoogleRoutesProvider
from app.distance.haversine import HaversineProvider
from app.distance.mapbox_matrix import MapboxMatrixError, MapboxMatrixProvider
from app.distance.osrm import OSRMError, OSRMProvider
from app.distance.types import Coord, MatrixProvider, MatrixResult, Polyline

logger = logging.getLogger(__name__)


class FallbackMatrixProvider:
    """Google Routes (sommeil) -> OSRM -> Mapbox -> Haversine.

    Chaque niveau absent (`google`/`osrm`/`mapbox` à `None`) est sauté
    silencieusement — c'est une configuration assumée, pas une panne. Seul
    un niveau *configuré mais en échec* déclenche un `WARNING` et une
    bascule.
    """

    def __init__(
        self,
        osrm: OSRMProvider | None,
        haversine: MatrixProvider | None = None,
        google: GoogleRoutesProvider | None = None,
        mapbox: MapboxMatrixProvider | None = None,
    ) -> None:
        self.google = google
        self.osrm = osrm
        self.mapbox = mapbox
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
                logger.warning("Repli sur Mapbox (OSRM indisponible) : %s", exc)
                last_error = str(exc)

        if self.mapbox is not None:
            try:
                return await self.mapbox.matrix(coords)
            except MapboxMatrixError as exc:
                logger.warning("Repli sur Haversine (Mapbox indisponible) : %s", exc)
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
