"""Proximité géométrique entre inscrits — cf. plan (« points de
rassemblement intelligents »). Fonctions pures, testables sans base de
données ni réseau, même esprit que app.impact.

Ce module ne connaît PAS Google Places : il se contente de dire si des
inscrits sont assez proches pour être candidats à un regroupement. C'est la
route (POST /events/{id}/meetup-point) qui interroge ensuite Places pour un
vrai lieu autour du centroïde du groupe, une fois ce dernier confirmé assez
proche par `is_nearby_group`.
"""

from __future__ import annotations

from typing import TypeVar

from app.distance.haversine import haversine_m
from app.distance.types import Coord

# Rayon de regroupement — cf. demande initiale ("passagers à moins de 2 km").
DEFAULT_CLUSTER_RADIUS_M = 2000

T = TypeVar("T")


def is_nearby_group(stops: list[tuple[T, Coord]], radius_m: float = DEFAULT_CLUSTER_RADIUS_M) -> bool:
    """Vrai si `stops` contient au moins deux arrêts et que son diamètre
    (distance maximale entre deux arrêts quelconques, peu importe lesquels)
    ne dépasse pas `2 * radius_m`.

    Critère indépendant de l'ordre des arrêts, par construction : le
    regroupement glouton graine+rayon fait côté client (`frontend/lib/
    nearby.ts`) dépend de quel arrêt sert de graine, mais l'inégalité
    triangulaire garantit que tout groupe qu'il produit a un diamètre
    <= 2 * radius_m (chaque membre est à <= radius_m de la graine, donc deux
    membres sont à <= 2 * radius_m l'un de l'autre). Cette borne ne peut donc
    jamais refuser un groupe légitime, quelle que soit l'implémentation du
    regroupement côté client, présente ou future — elle borne malgré tout la
    requête payante à une zone d'environ 4 km de large faite d'adresses
    réelles de cet événement.

    Le critère "tous à <= radius_m du centroïde" a été écarté : plus strict
    que le regroupement client, il produirait de vrais faux refus sur un
    groupe déséquilibré (une graine isolée + une grappe : le centroïde
    dérive vers la grappe, éloignant la graine au-delà de radius_m).

    Coût : O(n²) haversines au pire (780 pour 40 inscrits) — négligeable
    face au coût d'un appel Places.
    """
    if len(stops) < 2:
        return False
    coords = [c for _, c in stops]
    diameter = max(
        haversine_m(coords[i], coords[j]) for i in range(len(coords)) for j in range(i + 1, len(coords))
    )
    return diameter <= 2 * radius_m


def centroid(coords: list[Coord]) -> Coord:
    """Moyenne simple des latitudes/longitudes — suffisant pour centrer une
    recherche Google Places sur un petit groupe de points proches ; pas
    destiné à des distances continentales où cette moyenne naïve dérive."""
    return Coord(
        lat=sum(c.lat for c in coords) / len(coords),
        lon=sum(c.lon for c in coords) / len(coords),
    )
