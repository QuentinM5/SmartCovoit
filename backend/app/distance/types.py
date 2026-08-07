"""Types communs aux providers de matrice de distances (OSRM, Haversine, fallback)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

MatrixSource = Literal["google", "osrm", "haversine"]

# Suite de points (lat, lon) décrivant un tracé sur la carte.
Polyline = list[list[float]]


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

    distances: list[list[int]]  # mètres, entiers, matrice carrée — toujours renseigné
    source: MatrixSource
    fallback_reason: str | None = None
    # Secondes, matrice carrée. Absent seulement pour Haversine (une ligne
    # droite n'a pas de durée de circulation). C'est ce que le solveur
    # minimise quand ce champ est renseigné — `distances` reste la vérité
    # affichée en km, quelle que soit la source.
    durations: list[list[int]] | None = None


class MatrixProvider(Protocol):
    """Un provider sait transformer une liste de coordonnées en matrice de distances."""

    async def matrix(self, coords: list[Coord]) -> MatrixResult: ...
