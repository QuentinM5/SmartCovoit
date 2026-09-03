"""Benchmark exploratoire : compare plusieurs configurations d'algorithmes
OR-Tools (stratégie de première solution + métaheuristique de recherche
locale) sur des scénarios synthétiques, pour appuyer une discussion sur un
éventuel changement de la solution en production.

Ne touche PAS à app/solver/vrp.py : chaque configuration est résolue avec
une copie paramétrée de la même logique (`solve_parametrized` ci-dessous),
pas le solveur de prod. Rien ici n'est branché à l'API — exploratoire
uniquement, cf. consigne explicite de ne pas implémenter en prod les
algorithmes non retenus.

Distances synthétiques (Haversine + vitesse moyenne constante de 30 km/h),
pas d'appel réseau (OSRM/Google/Nominatim) : l'objectif est de comparer les
algorithmes entre eux sur des matrices identiques, pas de juger de la
justesse des distances affichées.

Usage :
    .venv/Scripts/python.exe scripts/benchmark_vrp_algorithms.py
    .venv/Scripts/python.exe scripts/benchmark_vrp_algorithms.py --quick   # sanity check rapide
"""

from __future__ import annotations

import argparse
import csv
import math
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ortools.constraint_solver import pywrapcp, routing_enums_pb2  # noqa: E402

from app.distance.haversine import haversine_m  # noqa: E402
from app.distance.types import Coord  # noqa: E402
from app.solver.model import (  # noqa: E402
    Direction,
    DriverSpec,
    PassengerSpec,
    Route,
    Solution,
    Stop,
)

MONTREAL = Coord(45.5017, -73.5673)
SPREAD_KM = 12.0
AVG_SPEED_MS = 30 * 1000 / 3600  # 30 km/h moyenne urbaine -> m/s, pour dériver une durée synthétique


def jittered_coord(rng: random.Random, center: Coord, radius_km: float) -> Coord:
    distance_km = radius_km * math.sqrt(rng.random())
    angle = rng.uniform(0, 2 * math.pi)
    lat = center.lat + (distance_km / 111.0) * math.cos(angle)
    lon = center.lon + (distance_km / (111.0 * math.cos(math.radians(center.lat)))) * math.sin(angle)
    return Coord(round(lat, 6), round(lon, 6))


@dataclass
class Scenario:
    label: str
    direction: Direction
    distance_matrix: list[list[int]]
    duration_matrix: list[list[int]]
    drivers: list[DriverSpec]
    passengers: list[PassengerSpec]


def build_scenario(n_people: int, direction: Direction, seed: int) -> Scenario:
    rng = random.Random(seed)
    seat_counts = [4, 3, 3] if n_people <= 15 else [5, 5, 5, 5, 5, 7, 7]
    n_passengers = n_people - len(seat_counts)
    assert n_passengers > 0, f"{n_people} personnes insuffisant pour {len(seat_counts)} conducteurs"

    coords = [MONTREAL]  # nœud 0 = dépôt
    drivers: list[DriverSpec] = []
    for i, seats in enumerate(seat_counts):
        coords.append(jittered_coord(rng, MONTREAL, SPREAD_KM))
        drivers.append(DriverSpec(id=f"d{i}", name=f"Conducteur {i + 1}", seats=seats, node=len(coords) - 1))

    passengers: list[PassengerSpec] = []
    for i in range(n_passengers):
        coords.append(jittered_coord(rng, MONTREAL, SPREAD_KM))
        passengers.append(PassengerSpec(id=f"p{i}", name=f"Passager {i + 1}", node=len(coords) - 1))

    n = len(coords)
    distance_matrix = [[0] * n for _ in range(n)]
    duration_matrix = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            d = haversine_m(coords[i], coords[j])
            distance_matrix[i][j] = d
            duration_matrix[i][j] = round(d / AVG_SPEED_MS)

    label = f"{direction.value} · {n_people} pers. ({len(seat_counts)} cond., {n_passengers} pass.)"
    return Scenario(label, direction, distance_matrix, duration_matrix, drivers, passengers)


# (nom court, first_solution_strategy, local_search_metaheuristic)
ALGO_CONFIGS: list[tuple[str, str, str]] = [
    ("A_construction_seule", "PATH_CHEAPEST_ARC", "GREEDY_DESCENT"),
    ("B_actuel_prod", "PATH_CHEAPEST_ARC", "GUIDED_LOCAL_SEARCH"),
    ("C_tabu_search", "PATH_CHEAPEST_ARC", "TABU_SEARCH"),
    ("D_recuit_simule", "PATH_CHEAPEST_ARC", "SIMULATED_ANNEALING"),
    ("E_savings_gls", "SAVINGS", "GUIDED_LOCAL_SEARCH"),
    ("F_insertion_gls", "PARALLEL_CHEAPEST_INSERTION", "GUIDED_LOCAL_SEARCH"),
]


def solve_parametrized(
    scenario: Scenario,
    first_solution_name: str,
    metaheuristic_name: str,
    time_limit_s: int,
) -> tuple[Solution | None, float]:
    """Copie paramétrée de app/solver/vrp.py::solve, pour ce benchmark
    uniquement — le solveur de prod n'est ni importé ni modifié ici."""
    num_nodes = len(scenario.distance_matrix)
    num_vehicles = len(scenario.drivers)
    driver_nodes = [d.node for d in scenario.drivers]
    if scenario.direction == Direction.RAMASSAGE:
        starts, ends = driver_nodes, [0] * num_vehicles
    else:
        starts, ends = [0] * num_vehicles, driver_nodes

    manager = pywrapcp.RoutingIndexManager(num_nodes, num_vehicles, starts, ends)
    routing = pywrapcp.RoutingModel(manager)

    cost_matrix = scenario.duration_matrix

    def cost_callback(from_index: int, to_index: int) -> int:
        return cost_matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)]

    transit_idx = routing.RegisterTransitCallback(cost_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_idx)

    passenger_nodes = {p.node: p.id for p in scenario.passengers}

    def demand_callback(from_index: int) -> int:
        return 1 if manager.IndexToNode(from_index) in passenger_nodes else 0

    demand_idx = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_idx, 0, [d.seats for d in scenario.drivers], True, "Capacity"
    )

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = getattr(routing_enums_pb2.FirstSolutionStrategy, first_solution_name)
    params.local_search_metaheuristic = getattr(routing_enums_pb2.LocalSearchMetaheuristic, metaheuristic_name)
    params.time_limit.FromSeconds(time_limit_s)

    start = time.perf_counter()
    assignment = routing.SolveWithParameters(params)
    wall_time = time.perf_counter() - start

    if assignment is None:
        return None, wall_time

    routes: list[Route] = []
    total_distance = 0
    total_duration = 0
    for vehicle_id in range(num_vehicles):
        stops: list[Stop] = []
        index = routing.Start(vehicle_id)
        cumulative_d = 0
        cumulative_t = 0
        node = manager.IndexToNode(index)
        stops.append(Stop(node=node, passenger_id=None, cumulative_distance_m=0, cumulative_duration_s=0))
        while not routing.IsEnd(index):
            next_index = assignment.Value(routing.NextVar(index))
            fn, tn = manager.IndexToNode(index), manager.IndexToNode(next_index)
            cumulative_d += scenario.distance_matrix[fn][tn]
            cumulative_t += scenario.duration_matrix[fn][tn]
            if not routing.IsEnd(next_index):
                stops.append(
                    Stop(
                        node=tn,
                        passenger_id=passenger_nodes.get(tn),
                        cumulative_distance_m=cumulative_d,
                        cumulative_duration_s=cumulative_t,
                    )
                )
            index = next_index
        end_node = manager.IndexToNode(index)
        stops.append(
            Stop(node=end_node, passenger_id=None, cumulative_distance_m=cumulative_d, cumulative_duration_s=cumulative_t)
        )
        routes.append(
            Route(
                driver_id=scenario.drivers[vehicle_id].id,
                driver_name=scenario.drivers[vehicle_id].name,
                stops=stops,
                distance_m=cumulative_d,
                duration_s=cumulative_t,
            )
        )
        total_distance += cumulative_d
        total_duration += cumulative_t

    return Solution(routes=routes, total_distance_m=total_distance, total_duration_s=total_duration), wall_time


@dataclass
class RunResult:
    n_people: int
    direction: str
    time_limit_s: int
    algo: str
    first_solution: str
    metaheuristic: str
    wall_time_s: float
    total_duration_s: int | None
    total_distance_m: int
    max_route_duration_s: int
    min_route_duration_s: int
    spread_s: int
    empty_routes: int
    feasible: bool


def run_all(sizes: tuple[int, ...], time_limits: tuple[int, ...]) -> list[RunResult]:
    results: list[RunResult] = []
    for n_people in sizes:
        for direction in (Direction.DISPERSION, Direction.RAMASSAGE):
            scenario = build_scenario(n_people, direction, seed=42)
            for time_limit in time_limits:
                for algo_name, fs, ls in ALGO_CONFIGS:
                    solution, wall_time = solve_parametrized(scenario, fs, ls, time_limit)
                    if solution is None:
                        print(f"[ECHEC] {scenario.label} | {time_limit}s | {algo_name}")
                        results.append(
                            RunResult(n_people, direction.value, time_limit, algo_name, fs, ls, round(wall_time, 2), None, 0, 0, 0, 0, 0, False)
                        )
                        continue
                    durations = [r.duration_s for r in solution.routes if r.duration_s is not None]
                    empty = sum(1 for r in solution.routes if len(r.passenger_ids) == 0)
                    spread = max(durations) - min(durations)
                    print(
                        f"[OK] {scenario.label} | {time_limit}s | {algo_name:<22} | "
                        f"total={solution.total_duration_s:>5}s | ecart={spread:>5}s | vide={empty} | wall={wall_time:.1f}s"
                    )
                    results.append(
                        RunResult(
                            n_people, direction.value, time_limit, algo_name, fs, ls, round(wall_time, 2),
                            solution.total_duration_s, solution.total_distance_m,
                            max(durations), min(durations), spread, empty, True,
                        )
                    )
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quick", action="store_true", help="Sanity check rapide (10 personnes, 5s, 1 config).")
    args = parser.parse_args()

    if args.quick:
        scenario = build_scenario(10, Direction.DISPERSION, seed=42)
        solution, wall = solve_parametrized(scenario, "PATH_CHEAPEST_ARC", "GUIDED_LOCAL_SEARCH", 5)
        assert solution is not None, "Le sanity check aurait dû trouver une solution."
        print(f"OK — {scenario.label} : total={solution.total_duration_s}s, wall={wall:.1f}s")
        return

    results = run_all(sizes=(10, 40), time_limits=(10, 30))

    out_path = Path(__file__).resolve().parent / "benchmark_results.csv"
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "n_people", "direction", "time_limit_s", "algo", "first_solution", "metaheuristic",
                "wall_time_s", "total_duration_s", "total_distance_m",
                "max_route_duration_s", "min_route_duration_s", "spread_s", "empty_routes", "feasible",
            ]
        )
        for r in results:
            writer.writerow(
                [
                    r.n_people, r.direction, r.time_limit_s, r.algo, r.first_solution, r.metaheuristic,
                    r.wall_time_s, r.total_duration_s, r.total_distance_m,
                    r.max_route_duration_s, r.min_route_duration_s, r.spread_s, r.empty_routes, r.feasible,
                ]
            )
    print(f"\nRésultats écrits dans {out_path}")


if __name__ == "__main__":
    main()
