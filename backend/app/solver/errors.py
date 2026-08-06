"""Erreurs du solveur — toujours porteuses d'un message chiffré et actionnable.

Le brief est explicite : passagers > places disponibles doit renvoyer une
erreur claire, pas planter. Ces exceptions sont attrapées par la couche API
(étape 4) et traduites en 422 avec le message tel quel.
"""

from __future__ import annotations


class SolverError(Exception):
    """Base commune, pour permettre un `except SolverError` générique côté API."""


class InfeasibleError(SolverError):
    """Le problème est infaisable *avant même* d'appeler OR-Tools.

    Détecté par une vérification arithmétique simple (capacité totale
    insuffisante), ce qui évite de laisser le solveur tourner pour rien
    et permet un message d'erreur chiffré et immédiat.
    """

    def __init__(self, total_seats: int, total_passengers: int) -> None:
        self.total_seats = total_seats
        self.total_passengers = total_passengers
        super().__init__(
            f"Capacité insuffisante : {total_passengers} passager(s) pour "
            f"{total_seats} place(s) disponibles au total "
            f"(manque {total_passengers - total_seats})."
        )


class NoSolutionError(SolverError):
    """OR-Tools n'a trouvé aucune solution alors que la capacité totale suffisait.

    Cas résiduel (ex. limite de temps trop courte sur une instance très
    contrainte) — distinct de `InfeasibleError` pour que l'appelant puisse
    réagir différemment (ex. proposer de relancer avec plus de temps).
    """

    def __init__(self, message: str = "Aucune solution trouvée par le solveur.") -> None:
        super().__init__(message)
