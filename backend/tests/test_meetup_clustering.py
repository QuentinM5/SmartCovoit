"""Tests de app.meetup_clustering — fonctions pures, isolées de la base et
du réseau, même philosophie que test_impact.py."""

from __future__ import annotations

from app.distance.types import Coord
from app.meetup_clustering import centroid, cluster_nearby_stops

# Trois points à Montréal, très proches les uns des autres (quelques
# centaines de mètres) : doivent former un seul groupe à 2 km.
NEAR_A = Coord(45.5017, -73.5673)
NEAR_B = Coord(45.5040, -73.5700)
NEAR_C = Coord(45.5010, -73.5650)
# À Québec, loin de tout ce qui précède (> 200 km) : jamais dans le même groupe.
FAR = Coord(46.8139, -71.2080)


def test_cluster_nearby_stops_groups_close_points() -> None:
    stops = [("a", NEAR_A), ("b", NEAR_B), ("c", NEAR_C)]
    groups = cluster_nearby_stops(stops)
    assert len(groups) == 1
    assert {pid for pid, _ in groups[0]} == {"a", "b", "c"}


def test_cluster_nearby_stops_ignores_lone_far_point() -> None:
    stops = [("a", NEAR_A), ("b", NEAR_B), ("far", FAR)]
    groups = cluster_nearby_stops(stops)
    # "far" seul ne forme pas de groupe (minimum 2 membres) — seul le
    # groupe proche est renvoyé.
    assert len(groups) == 1
    assert {pid for pid, _ in groups[0]} == {"a", "b"}


def test_cluster_nearby_stops_no_group_when_all_alone() -> None:
    stops = [("a", NEAR_A), ("far", FAR)]
    assert cluster_nearby_stops(stops) == []


def test_cluster_nearby_stops_empty_input() -> None:
    assert cluster_nearby_stops([]) == []


def test_cluster_nearby_stops_respects_custom_radius() -> None:
    # NEAR_A et NEAR_B sont à plus de 200 m mais moins de 2 km l'un de
    # l'autre : un rayon de 100 m ne doit pas les regrouper.
    stops = [("a", NEAR_A), ("b", NEAR_B)]
    assert cluster_nearby_stops(stops, radius_m=100) == []


def test_centroid_averages_coordinates() -> None:
    result = centroid([Coord(0, 0), Coord(2, 4)])
    assert result.lat == 1
    assert result.lon == 2
