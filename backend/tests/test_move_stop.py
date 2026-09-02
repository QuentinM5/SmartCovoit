"""Tests des helpers de `move_stop` (déplacement manuel d'un passager après
un calcul), isolés de l'API et de la base de données — même philosophie que
`test_vrp.py`.

`FallbackMatrixProvider(osrm=None)` donne un provider Haversine pur,
déterministe et sans réseau (`route_geometry()` renvoie toujours `None`
sans OSRM — attendu et vérifié plutôt que contourné).
"""

from __future__ import annotations

import uuid

from app.api import schemas
from app.api.routes import _recompute_fixed_order, _reinsert_passenger
from app.db.models import Passenger
from app.distance.fallback import FallbackMatrixProvider
from app.distance.types import Coord

PROVIDER = FallbackMatrixProvider(osrm=None)

# Points alignés, ~1.11 km d'écart par unité (0.01° de latitude) — assez
# pour que l'ordre le long de la ligne soit sans ambiguïté.
BASE_LAT = 45.0
LON = -73.0


def coord_on_line(offset: float) -> Coord:
    return Coord(BASE_LAT + offset * 0.01, LON)


def stop_at(offset: float, *, passenger_id: uuid.UUID | None = None, node: int = 0) -> schemas.StopOut:
    return schemas.StopOut(
        node=node,
        passenger_id=passenger_id,
        passenger_name=None,
        cumulative_distance_m=0,  # recalculé par les helpers testés
        cumulative_duration_s=None,
    )


def make_passenger(offset: float, name: str = "Test") -> Passenger:
    p = Passenger(id=uuid.uuid4(), name=name, address="adresse test", lat=BASE_LAT + offset * 0.01, lon=LON)
    return p


async def test_reinsert_passenger_single_gap():
    """Une tournée sans passager (juste les deux bornes) n'a qu'une seule
    position possible : entre le départ et l'arrivée."""
    depot = stop_at(0, node=0)
    home = stop_at(10, node=1)
    passenger = make_passenger(5)

    stops, distance_m, duration_s, source, fallback_reason, geometry = await _reinsert_passenger(
        PROVIDER, [depot, home], [coord_on_line(0), coord_on_line(10)], passenger, passenger_node=99
    )

    assert [s.passenger_id for s in stops] == [None, passenger.id, None]
    assert distance_m > 0
    assert duration_s is None  # Haversine ne produit pas de durée
    assert source == "haversine"
    assert geometry is None  # pas d'OSRM configuré dans ce provider de test
    # Cumuls strictement croissants le long d'une ligne.
    assert [s.cumulative_distance_m for s in stops] == sorted(s.cumulative_distance_m for s in stops)


async def test_reinsert_passenger_chooses_cheapest_position():
    """Trois arrêts déjà en place (dépôt, un passager, domicile) : le
    nouveau passager doit atterrir géographiquement au bon endroit, pas
    juste être ajouté à la fin."""
    existing_id = uuid.uuid4()
    depot = stop_at(0, node=0)
    existing = stop_at(10, passenger_id=existing_id, node=0)
    home = stop_at(20, node=1)
    base_stops = [depot, existing, home]
    base_coords = [coord_on_line(0), coord_on_line(10), coord_on_line(20)]

    # Entre le passager existant (10) et le domicile (20) : offset 15.
    far_passenger = make_passenger(15)
    stops, *_ = await _reinsert_passenger(PROVIDER, base_stops, base_coords, far_passenger, passenger_node=99)
    assert [s.passenger_id for s in stops] == [None, existing_id, far_passenger.id, None]

    # Entre le dépôt (0) et le passager existant (10) : offset 3.
    near_passenger = make_passenger(3)
    stops, *_ = await _reinsert_passenger(PROVIDER, base_stops, base_coords, near_passenger, passenger_node=99)
    assert [s.passenger_id for s in stops] == [None, near_passenger.id, existing_id, None]


async def test_reinsert_passenger_noop_when_already_optimal():
    """Retirer un passager déjà à sa meilleure position puis le réinsérer
    doit le remettre exactement là où il était — c'est la propriété dont
    dépend la détection de no-op dans l'endpoint."""
    a_id, b_id = uuid.uuid4(), uuid.uuid4()
    depot = stop_at(0, node=0)
    a = stop_at(10, passenger_id=a_id, node=0)
    home = stop_at(20, node=1)
    b = make_passenger(15, name="B")

    # b déjà correctement placé entre a (10) et home (20).
    base_stops_without_b = [depot, a, home]
    base_coords_without_b = [coord_on_line(0), coord_on_line(10), coord_on_line(20)]

    stops, *_ = await _reinsert_passenger(PROVIDER, base_stops_without_b, base_coords_without_b, b, passenger_node=99)
    assert [s.passenger_id for s in stops] == [None, a_id, b.id, None]


async def test_recompute_fixed_order_cumulative():
    """Le retrait d'un passager ne doit pas changer l'ordre du reste, et les
    cumuls doivent correspondre à la somme des segments consécutifs."""
    depot = stop_at(0, node=0)
    a = stop_at(10, passenger_id=uuid.uuid4(), node=0)
    home = stop_at(25, node=1)
    stops = [depot, a, home]
    coords = [coord_on_line(0), coord_on_line(10), coord_on_line(25)]

    new_stops, total_distance, total_duration, source, fallback_reason, geometry = await _recompute_fixed_order(
        PROVIDER, stops, coords
    )

    assert [s.passenger_id for s in new_stops] == [None, a.passenger_id, None]
    assert new_stops[0].cumulative_distance_m == 0
    assert new_stops[-1].cumulative_distance_m == total_distance
    # Les cumuls sont strictement croissants sur une ligne sans détour.
    cumulatives = [s.cumulative_distance_m for s in new_stops]
    assert cumulatives == sorted(cumulatives)
    assert source == "haversine"
    assert geometry is None
