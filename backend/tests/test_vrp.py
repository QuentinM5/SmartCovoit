"""Tests du solveur VRP, isolé de l'API et de la base de données.

Couvre les cas exigés par le brief : capacité respectée, ramassage vs
dispersion, conducteur unique, passagers > places totales (erreur claire),
et l'invariant central : chaque passager servi exactement une fois.
"""

from __future__ import annotations

import pytest

from app.solver.errors import InfeasibleError, NoSolutionError
from app.solver.model import Direction, DriverSpec, PassengerSpec, SolveRequest
from app.solver.vrp import solve


def line_matrix(n: int) -> list[list[int]]:
    """Matrice de distances triviale : nœuds alignés, espacés de 1000 m.

    Suffisant pour valider la structure des tournées (capacité, ordre
    start/end) sans dépendre de vraies coordonnées géographiques.
    """
    return [[abs(i - j) * 1000 for j in range(n)] for i in range(n)]


def build_request(
    direction: Direction,
    driver_seats: list[int],
    passenger_count: int,
    time_limit_s: int = 5,
) -> SolveRequest:
    """Construit une requête : nœud 0 = dépôt, 1..D = conducteurs, D+1.. = passagers."""
    num_drivers = len(driver_seats)
    n_nodes = 1 + num_drivers + passenger_count

    drivers = [
        DriverSpec(id=f"d{i}", name=f"Driver{i}", seats=seats, node=1 + i)
        for i, seats in enumerate(driver_seats)
    ]
    passengers = [
        PassengerSpec(id=f"p{i}", name=f"Passenger{i}", node=1 + num_drivers + i)
        for i in range(passenger_count)
    ]

    return SolveRequest(
        direction=direction,
        distance_matrix=line_matrix(n_nodes),
        drivers=drivers,
        passengers=passengers,
        time_limit_s=time_limit_s,
    )


def test_capacity_never_exceeded():
    # 2 places + 3 places = 5 sièges, exactement 5 passagers
    request = build_request(Direction.RAMASSAGE, driver_seats=[2, 3], passenger_count=5)
    solution = solve(request)

    assert len(solution.routes) == 2
    for route, driver in zip(solution.routes, request.drivers):
        assert len(route.passenger_ids) <= driver.seats


def test_all_passengers_served_exactly_once():
    request = build_request(Direction.RAMASSAGE, driver_seats=[2, 3, 1], passenger_count=6)
    solution = solve(request)

    served = [pid for route in solution.routes for pid in route.passenger_ids]
    expected = {p.id for p in request.passengers}

    assert len(served) == len(expected)
    assert set(served) == expected


def test_ramassage_starts_at_driver_ends_at_depot():
    request = build_request(Direction.RAMASSAGE, driver_seats=[2, 2], passenger_count=3)
    solution = solve(request)

    for route, driver in zip(solution.routes, request.drivers):
        assert route.stops[0].node == driver.node
        assert route.stops[-1].node == request.depot_node


def test_dispersion_starts_at_depot_ends_at_driver():
    request = build_request(Direction.DISPERSION, driver_seats=[2, 2], passenger_count=3)
    solution = solve(request)

    for route, driver in zip(solution.routes, request.drivers):
        assert route.stops[0].node == request.depot_node
        assert route.stops[-1].node == driver.node


def test_single_driver_serves_everyone():
    request = build_request(Direction.RAMASSAGE, driver_seats=[4], passenger_count=4)
    solution = solve(request)

    assert len(solution.routes) == 1
    route = solution.routes[0]
    assert set(route.passenger_ids) == {p.id for p in request.passengers}


def test_passengers_exceed_total_seats_raises_infeasible():
    # 2 conducteurs x 2 places = 4 sièges, 7 passagers
    request = build_request(Direction.RAMASSAGE, driver_seats=[2, 2], passenger_count=7)

    with pytest.raises(InfeasibleError) as exc_info:
        solve(request)

    err = exc_info.value
    assert err.total_seats == 4
    assert err.total_passengers == 7
    # message chiffré et lisible, pas un traceback opaque
    assert "4" in str(err)
    assert "7" in str(err)


def test_driver_home_never_visited_by_another_vehicle():
    """Le domicile du conducteur A ne doit jamais être un arrêt pour le conducteur B."""
    request = build_request(Direction.RAMASSAGE, driver_seats=[3, 3], passenger_count=4)
    solution = solve(request)

    driver_nodes = {d.node for d in request.drivers}
    for route in solution.routes:
        intermediate_nodes = {s.node for s in route.stops[1:-1]}
        assert intermediate_nodes.isdisjoint(driver_nodes)


def test_no_solution_error_message_is_usable():
    with pytest.raises(NoSolutionError) as exc_info:
        raise NoSolutionError()
    assert str(exc_info.value)
