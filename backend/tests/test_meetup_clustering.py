"""Tests de app.meetup_clustering — fonctions pures, isolées de la base et
du réseau, même philosophie que test_impact.py."""

from __future__ import annotations

from app.distance.types import Coord
from app.meetup_clustering import centroid, is_nearby_group

# Trois points à Montréal, très proches les uns des autres (quelques
# centaines de mètres) : doivent former un seul groupe à 2 km.
NEAR_A = Coord(45.5017, -73.5673)
NEAR_B = Coord(45.5040, -73.5700)
NEAR_C = Coord(45.5010, -73.5650)
# À Québec, loin de tout ce qui précède (> 200 km) : jamais dans le même groupe.
FAR = Coord(46.8139, -71.2080)

# Trois points alignés nord-sud, à ~1,5 km d'écart chacun : les extrémités
# sont à ~3 km l'une de l'autre, sous le diamètre de 4 km (2 * rayon par
# défaut) — cf. test_is_nearby_group_accepts_chain_within_diameter.
CHAIN_A = Coord(45.5000, -73.5673)
CHAIN_B = Coord(45.5135, -73.5673)
CHAIN_C = Coord(45.5270, -73.5673)

# Deux points à ~5 km l'un de l'autre : au-delà du diamètre de 4 km.
FAR_PAIR_A = Coord(45.5000, -73.5673)
FAR_PAIR_B = Coord(45.5450, -73.5673)


def test_centroid_averages_coordinates() -> None:
    result = centroid([Coord(0, 0), Coord(2, 4)])
    assert result.lat == 1
    assert result.lon == 2


def test_is_nearby_group_true_for_close_points() -> None:
    stops = [("a", NEAR_A), ("b", NEAR_B), ("c", NEAR_C)]
    assert is_nearby_group(stops) is True


def test_is_nearby_group_false_when_one_is_far() -> None:
    stops = [("a", NEAR_A), ("b", NEAR_B), ("far", FAR)]
    assert is_nearby_group(stops) is False


def test_is_nearby_group_false_for_single_stop() -> None:
    assert is_nearby_group([("a", NEAR_A)]) is False


def test_is_nearby_group_false_for_empty_input() -> None:
    assert is_nearby_group([]) is False


def test_is_nearby_group_respects_custom_radius() -> None:
    # NEAR_A et NEAR_B sont à plus de 200 m mais moins de 2 km l'un de
    # l'autre : au rayon par défaut (diamètre autorisé 4 km) ils passent,
    # mais un rayon de 100 m (diamètre autorisé 200 m) les refuse.
    stops = [("a", NEAR_A), ("b", NEAR_B)]
    assert is_nearby_group(stops) is True
    assert is_nearby_group(stops, radius_m=100) is False


def test_is_nearby_group_independent_of_order() -> None:
    # C'est le contrat qui dispense le client de trier son groupe avant
    # d'appeler l'API : peu importe l'ordre dans lequel les participants ont
    # été sélectionnés côté frontend, la réponse serveur doit être la même.
    near_stops = [("a", NEAR_A), ("b", NEAR_B), ("c", NEAR_C)]
    assert is_nearby_group(near_stops) is True
    assert is_nearby_group(list(reversed(near_stops))) is True
    assert is_nearby_group([near_stops[1], near_stops[2], near_stops[0]]) is True

    far_stops = [("a", NEAR_A), ("b", NEAR_B), ("far", FAR)]
    assert is_nearby_group(far_stops) is False
    assert is_nearby_group(list(reversed(far_stops))) is False
    assert is_nearby_group([far_stops[2], far_stops[0], far_stops[1]]) is False


def test_is_nearby_group_accepts_chain_within_diameter() -> None:
    stops = [("a", CHAIN_A), ("b", CHAIN_B), ("c", CHAIN_C)]
    assert is_nearby_group(stops) is True


def test_is_nearby_group_rejects_pair_beyond_diameter() -> None:
    stops = [("a", FAR_PAIR_A), ("b", FAR_PAIR_B)]
    assert is_nearby_group(stops) is False
