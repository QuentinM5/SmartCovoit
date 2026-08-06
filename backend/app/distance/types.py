"""Types communs aux providers de matrice de distances (OSRM, Haversine, fallback)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

MatrixSource = Literal["osrm", "haversine"]


@dataclass(frozen=True)
class Coord:
    """Coordonnée géographique, ordre (lat, lon) — cohérent avec le reste de l'app.

    OSRM attend lon,lat dans son URL ; c'est `OSRMProvider` qui fait la
    conversion, pas l'appelant.
    """

    lat: float
    lon: float


@dataclass(frozen=True)
class MatrixResult:
    """Résultat d'un calcul de matrice, avec sa provenance.

    `source` remonte jusqu'à l'API puis jusqu'à l'écran : l'utilisateur doit
    pouvoir savoir quand les distances affichées sont estimées à vol d'oiseau
    plutôt que routières.
    """

    distances: list[list[int]]  # mètres, entiers, matrice carrée
    source: MatrixSource
    fallback_reason: str | None = None


class MatrixProvider(Protocol):
    """Un provider sait transformer une liste de coordonnées en matrice de distances."""

    async def matrix(self, coords: list[Coord]) -> MatrixResult: ...
