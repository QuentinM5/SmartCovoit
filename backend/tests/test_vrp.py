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


# --- Optimisation sur la durée plutôt que la distance -----------------------
#
# 1 conducteur, 2 passagers A et B : avec seulement 2 arrêts intermédiaires,
# il n'y a que deux tournées possibles (A puis B, ou B puis A). Les matrices
# sont construites pour que ces deux critères se contredisent : la distance
# favorise fortement "A puis B", la durée (embouteillage sur l'arête
# conducteur->A) favorise fortement "B puis A" — un cas qu'aucun hasard du
# solveur ne peut confondre.

_DISTANCE_FAVORS_A_THEN_B = [
    [0, 500, 2000, 1000],
    [500, 0, 1000, 2000],
    [2000, 1000, 0, 1000],
    [1000, 2000, 1000, 0],
]

_DURATION_FAVORS_B_THEN_A = [
    [0, 500, 100, 100],
    [500, 0, 5000, 100],
    [100, 5000, 0, 100],
    [100, 100, 100, 0],
]


def _duration_request(duration_matrix: list[list[int]] | None) -> SolveRequest:
    driver = DriverSpec(id="d0", name="Driver", seats=2, node=1)
    passenger_a = PassengerSpec(id="pA", name="A", node=2)
    passenger_b = PassengerSpec(id="pB", name="B", node=3)
    return SolveRequest(
        direction=Direction.RAMASSAGE,
        distance_matrix=_DISTANCE_FAVORS_A_THEN_B,
        duration_matrix=duration_matrix,
        drivers=[driver],
        passengers=[passenger_a, passenger_b],
    )


def _visit_order(solution) -> list[str]:
    route = solution.routes[0]
    return [s.passenger_id for s in route.stops if s.passenger_id is not None]


def test_without_duration_matrix_solver_optimizes_distance():
    solution = solve(_duration_request(duration_matrix=None))

    assert _visit_order(solution) == ["pA", "pB"]
    assert solution.total_distance_m == 3000
    assert solution.total_duration_s is None
    assert solution.routes[0].duration_s is None
    assert all(s.cumulative_duration_s is None for s in solution.routes[0].stops)


def test_with_duration_matrix_solver_optimizes_duration_even_if_longer_in_distance():
    solution = solve(_duration_request(duration_matrix=_DURATION_FAVORS_B_THEN_A))

    assert _visit_order(solution) == ["pB", "pA"]
    assert solution.total_duration_s == 300
    # La tournée choisie est plus longue en distance que l'optimum distance
    # seule (5000 > 3000) : la preuve que c'est bien la durée qui a été
    # minimisée, pas la distance.
    assert solution.total_distance_m == 5000
