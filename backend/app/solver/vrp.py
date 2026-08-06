"""Solveur VRP capacitaire (OR-Tools) — le cœur du projet.

Un événement = un dépôt (nœud 0) + des conducteurs (chacun un véhicule de
capacité = ses places) + des passagers (chacun une demande de 1 place).
Objectif unique : minimiser la distance totale parcourue par la flotte.

Le nombre de véhicules est fixe et égal au nombre de conducteurs inscrits —
ce n'est pas une variable à minimiser. Un conducteur sans passager affecté
produit simplement une tournée directe start→end (cf. `direction`).
"""

from __future__ import annotations

import logging

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from app.solver.errors import InfeasibleError, NoSolutionError
from app.solver.model import Direction, Route, SolveRequest, Solution, Stop

logger = logging.getLogger(__name__)


def solve(request: SolveRequest) -> Solution:
    """Résout le VRP et renvoie une feuille de route par conducteur.

    Lève `InfeasibleError` si la capacité totale est insuffisante (vérifié
    avant tout appel à OR-Tools, pour un message chiffré immédiat), et
    `NoSolutionError` si OR-Tools ne trouve rien malgré une capacité
    suffisante (cas résiduel, ex. limite de temps trop courte).
    """
    _validate_request(request)

    total_passengers = len(request.passengers)
    if request.total_seats < total_passengers:
        raise InfeasibleError(total_seats=request.total_seats, total_passengers=total_passengers)

    num_nodes = len(request.distance_matrix)
    num_vehicles = len(request.drivers)

    driver_nodes = [d.node for d in request.drivers]
    if request.direction == Direction.RAMASSAGE:
        starts = driver_nodes
        ends = [request.depot_node] * num_vehicles
    else:
        starts = [request.depot_node] * num_vehicles
        ends = driver_nodes

    manager = pywrapcp.RoutingIndexManager(num_nodes, num_vehicles, starts, ends)
    routing = pywrapcp.RoutingModel(manager)

    matrix = request.distance_matrix

    def distance_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    passenger_nodes = {p.node: p.id for p in request.passengers}

    def demand_callback(from_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        return 1 if from_node in passenger_nodes else 0

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,  # pas de slack
        [d.seats for d in request.drivers],
        True,  # les compteurs de capacité démarrent à 0 à chaque véhicule
        "Capacity",
    )

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.FromSeconds(request.time_limit_s)

    assignment = routing.SolveWithParameters(search_parameters)
    if assignment is None:
        raise NoSolutionError()

    driver_id_by_vehicle = [d.id for d in request.drivers]
    driver_name_by_vehicle = [d.name for d in request.drivers]

    routes: list[Route] = []
    total_distance = 0

    for vehicle_id in range(num_vehicles):
        stops: list[Stop] = []
        index = routing.Start(vehicle_id)
        cumulative = 0

        node = manager.IndexToNode(index)
        stops.append(Stop(node=node, passenger_id=None, cumulative_distance_m=0))

        while not routing.IsEnd(index):
            next_index = assignment.Value(routing.NextVar(index))
            from_node = manager.IndexToNode(index)
            to_node = manager.IndexToNode(next_index)
            cumulative += matrix[from_node][to_node]

            if not routing.IsEnd(next_index):
                stops.append(
                    Stop(
                        node=to_node,
                        passenger_id=passenger_nodes.get(to_node),
                        cumulative_distance_m=cumulative,
                    )
                )
            index = next_index

        end_node = manager.IndexToNode(index)
        stops.append(Stop(node=end_node, passenger_id=None, cumulative_distance_m=cumulative))

        routes.append(
            Route(
                driver_id=driver_id_by_vehicle[vehicle_id],
                driver_name=driver_name_by_vehicle[vehicle_id],
                stops=stops,
                distance_m=cumulative,
            )
        )
        total_distance += cumulative

    _validate_solution(request, routes)

    return Solution(routes=routes, total_distance_m=total_distance)


def _validate_request(request: SolveRequest) -> None:
    """Garde-fous internes — signalent un bug d'appelant, pas une entrée utilisateur invalide."""
    num_nodes = len(request.distance_matrix)
    for row in request.distance_matrix:
        if len(row) != num_nodes:
            raise ValueError("La matrice de distances doit être carrée.")

    seen_nodes: dict[int, str] = {request.depot_node: "dépôt"}
    for d in request.drivers:
        if not (0 <= d.node < num_nodes):
            raise ValueError(f"Nœud {d.node} du conducteur {d.name!r} hors de la matrice.")
        if d.node in seen_nodes:
            raise ValueError(f"Nœud {d.node} utilisé à la fois par {seen_nodes[d.node]} et {d.name!r}.")
        seen_nodes[d.node] = f"conducteur {d.name!r}"

    for p in request.passengers:
        if not (0 <= p.node < num_nodes):
            raise ValueError(f"Nœud {p.node} du passager {p.name!r} hors de la matrice.")
        if p.node in seen_nodes:
            raise ValueError(f"Nœud {p.node} utilisé à la fois par {seen_nodes[p.node]} et {p.name!r}.")
        seen_nodes[p.node] = f"passager {p.name!r}"

    if not request.drivers:
        raise ValueError("Au moins un conducteur est requis pour résoudre l'événement.")


def _validate_solution(request: SolveRequest, routes: list[Route]) -> None:
    """Vérifie que chaque passager est servi exactement une fois et qu'aucune capacité n'est dépassée.

    OR-Tools garantit ça par construction (nœuds obligatoires, dimension de
    capacité) ; cette passe est une double vérification bon marché, pas une
    tentative de rattraper un bug du solveur.
    """
    all_served: list[str] = []
    for route, driver in zip(routes, request.drivers):
        served = route.passenger_ids
        if len(served) > driver.seats:
            raise NoSolutionError(
                f"Solution invalide : {driver.name!r} a {len(served)} passager(s) "
                f"pour {driver.seats} place(s)."
            )
        all_served.extend(served)

    expected = {p.id for p in request.passengers}
    got = set(all_served)
    if got != expected or len(all_served) != len(expected):
        raise NoSolutionError(
            "Solution invalide : tous les passagers n'ont pas été servis exactement une fois."
        )
