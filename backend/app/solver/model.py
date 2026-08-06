"""Types purs du solveur — aucune dépendance à FastAPI, SQLAlchemy ou OR-Tools.

Gardés séparés du reste de l'app pour que le solveur soit testable et
réutilisable sans base de données ni serveur HTTP (cf. brief : "valide qu'il
produit des résultats cohérents avant de brancher l'API dessus").
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Direction(str, Enum):
    """Sens du trajet pour l'ensemble d'un événement."""

    RAMASSAGE = "ramassage"  # tout le monde converge vers le dépôt (destination)
    DISPERSION = "dispersion"  # tout le monde part du dépôt (origine)


@dataclass(frozen=True)
class DriverSpec:
    """Un conducteur inscrit à l'événement.

    `node` est son index dans la matrice de distances passée au solveur
    (le dépôt est conventionnellement le nœud 0, cf. vrp.py).
    """

    id: str
    name: str
    seats: int
    node: int

    def __post_init__(self) -> None:
        if self.seats <= 0:
            raise ValueError(f"Conducteur {self.name!r} : seats doit être > 0, reçu {self.seats}.")


@dataclass(frozen=True)
class PassengerSpec:
    """Un passager inscrit à l'événement."""

    id: str
    name: str
    node: int


@dataclass(frozen=True)
class SolveRequest:
    """Entrée complète du solveur : direction, matrice de distances et participants.

    `distance_matrix[i][j]` = distance en mètres (entiers) du nœud i au nœud j.
    Index 0 = dépôt. Les nœuds des conducteurs et passagers doivent être
    distincts et cohérents avec la taille de la matrice.
    """

    direction: Direction
    distance_matrix: list[list[int]]
    drivers: list[DriverSpec]
    passengers: list[PassengerSpec]
    time_limit_s: int = 10

    @property
    def depot_node(self) -> int:
        return 0

    @property
    def total_seats(self) -> int:
        return sum(d.seats for d in self.drivers)


@dataclass(frozen=True)
class Stop:
    """Un arrêt dans la tournée d'un véhicule, dans l'ordre de passage."""

    node: int
    passenger_id: str | None  # None pour le dépôt ou le domicile du conducteur
    cumulative_distance_m: int


@dataclass(frozen=True)
class Route:
    """La feuille de route d'un véhicule (un conducteur)."""

    driver_id: str
    driver_name: str
    stops: list[Stop] = field(default_factory=list)
    distance_m: int = 0

    @property
    def passenger_ids(self) -> list[str]:
        return [s.passenger_id for s in self.stops if s.passenger_id is not None]


@dataclass(frozen=True)
class Solution:
    """Résultat complet du solve : une tournée par conducteur, distance totale."""

    routes: list[Route]
    total_distance_m: int
