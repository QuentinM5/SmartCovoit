"""Tests du client Google Routes : découpage/recollage au-delà de 625
éléments, analyse des durées, et gestion d'erreurs (aucune matrice
partielle silencieuse — cf. philosophie d'OSRMError).
"""

from __future__ import annotations

import json

import httpx
import pytest
import respx

import app.distance.google_routes as google_routes
from app.distance.google_routes import GoogleRoutesError, GoogleRoutesProvider, _parse_duration
from app.distance.types import Coord

MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"


def test_parse_duration_strips_trailing_s():
    assert _parse_duration("1234s") == 1234
    assert _parse_duration("0.6s") == 1  # arrondi, pas tronqué


async def test_single_coordinate_is_trivial_without_network_call():
    provider = GoogleRoutesProvider(api_key="k")
    result = await provider.matrix([Coord(0, 0)])

    assert result.source == "google"
    assert result.distances == [[0]]
    assert result.durations == [[0]]


async def test_matrix_chunks_and_reassembles_across_block_boundaries(monkeypatch):
    """Force une taille de bloc de 2 avec 4 points : 4 requêtes (2×2 blocs)
    dont les résultats doivent se recoller aux BONS indices globaux — le
    cœur du risque avec le découpage, une inversion d'indice entre blocs.
    """
    monkeypatch.setattr(google_routes, "_MAX_CHUNK", 2)

    coords = [Coord(float(i), float(i)) for i in range(4)]
    index_by_lat = {float(i): i for i in range(4)}

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        origins = [index_by_lat[o["waypoint"]["location"]["latLng"]["latitude"]] for o in body["origins"]]
        destinations = [
            index_by_lat[d["waypoint"]["location"]["latLng"]["latitude"]] for d in body["destinations"]
        ]
        elements = [
            {
                "originIndex": local_i,
                "destinationIndex": local_j,
                "distanceMeters": global_i * 1000 + global_j,
                "duration": f"{global_i * 100 + global_j}s",
                "condition": "ROUTE_EXISTS",
            }
            for local_i, global_i in enumerate(origins)
            for local_j, global_j in enumerate(destinations)
        ]
        return httpx.Response(200, json=elements)

    with respx.mock() as router:
        router.post(MATRIX_URL).mock(side_effect=handler)
        result = await GoogleRoutesProvider(api_key="k").matrix(coords)

    assert result.source == "google"
    for i in range(4):
        for j in range(4):
            if i == j:
                continue
            assert result.distances[i][j] == i * 1000 + j
            assert result.durations[i][j] == i * 100 + j


async def test_raises_on_http_error_status():
    with respx.mock() as router:
        router.post(MATRIX_URL).mock(return_value=httpx.Response(403, text="quota exceeded"))
        with pytest.raises(GoogleRoutesError):
            await GoogleRoutesProvider(api_key="k").matrix([Coord(0, 0), Coord(1, 1)])


async def test_raises_with_message_on_error_body():
    with respx.mock() as router:
        router.post(MATRIX_URL).mock(
            return_value=httpx.Response(200, json={"error": {"code": 403, "message": "API key invalid"}})
        )
        with pytest.raises(GoogleRoutesError, match="API key invalid"):
            await GoogleRoutesProvider(api_key="k").matrix([Coord(0, 0), Coord(1, 1)])


async def test_non_existent_route_counts_as_missing_not_silently_dropped():
    """Une paire non routable ne doit jamais produire une matrice partielle
    silencieuse — même philosophie que OSRMError sur une paire `null`."""
    with respx.mock() as router:
        router.post(MATRIX_URL).mock(
            return_value=httpx.Response(
                200,
                json=[
                    {
                        "originIndex": 0,
                        "destinationIndex": 1,
                        "distanceMeters": 100,
                        "duration": "10s",
                        "condition": "ROUTE_NOT_FOUND",
                    },
                    {
                        "originIndex": 1,
                        "destinationIndex": 0,
                        "distanceMeters": 100,
                        "duration": "10s",
                        "condition": "ROUTE_EXISTS",
                    },
                ],
            )
        )
        with pytest.raises(GoogleRoutesError, match="manquante"):
            await GoogleRoutesProvider(api_key="k").matrix([Coord(0, 0), Coord(1, 1)])


async def test_raises_on_malformed_element():
    with respx.mock() as router:
        router.post(MATRIX_URL).mock(
            return_value=httpx.Response(200, json=[{"condition": "ROUTE_EXISTS"}])  # champs manquants
        )
        with pytest.raises(GoogleRoutesError, match="malformé"):
            await GoogleRoutesProvider(api_key="k").matrix([Coord(0, 0), Coord(1, 1)])


async def test_diagonal_element_with_omitted_zero_distance_is_not_malformed():
    """Reproduit un cas réel observé en production : Google renvoie parfois
    l'élément diagonal (origine == destination) avec `duration: "0s"` mais
    SANS `distanceMeters` du tout — la sérialisation JSON de protobuf omet
    les champs scalaires à leur valeur par défaut (0). Absent ne veut pas
    dire malformé ici, seulement "zéro"."""
    with respx.mock() as router:
        router.post(MATRIX_URL).mock(
            return_value=httpx.Response(
                200,
                json=[
                    {"originIndex": 0, "destinationIndex": 0, "duration": "0s", "condition": "ROUTE_EXISTS"},
                    {
                        "originIndex": 0,
                        "destinationIndex": 1,
                        "distanceMeters": 500,
                        "duration": "60s",
                        "condition": "ROUTE_EXISTS",
                    },
                    {
                        "originIndex": 1,
                        "destinationIndex": 0,
                        "distanceMeters": 500,
                        "duration": "65s",
                        "condition": "ROUTE_EXISTS",
                    },
                ],
            )
        )
        result = await GoogleRoutesProvider(api_key="k").matrix([Coord(0, 0), Coord(1, 1)])

    assert result.distances[0][0] == 0
    assert result.durations[0][0] == 0
