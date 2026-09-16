"""Tests du client Mapbox Matrix : découpage/recollage par blocs de
`_MAX_CHUNK`, et gestion d'erreurs (aucune matrice partielle silencieuse —
même philosophie que GoogleRoutesError/OSRMError).
"""

from __future__ import annotations

import re

import httpx
import pytest
import respx

import app.distance.mapbox_matrix as mapbox_matrix
from app.distance.mapbox_matrix import MapboxMatrixError, MapboxMatrixProvider
from app.distance.types import Coord

MATRIX_URL_RE = re.compile(r"https://api\.mapbox\.com/directions-matrix/v1/mapbox/driving/.*")


async def test_single_coordinate_is_trivial_without_network_call():
    provider = MapboxMatrixProvider(access_token="tok")
    result = await provider.matrix([Coord(0, 0)])

    assert result.source == "mapbox"
    assert result.distances == [[0]]
    assert result.durations == [[0]]


async def test_matrix_chunks_and_reassembles_across_block_boundaries(monkeypatch):
    """Force une taille de bloc de 2 avec 4 points : 4 requêtes (2×2 blocs)
    dont les résultats doivent se recoller aux BONS indices globaux — le
    cœur du risque avec le découpage, une inversion d'indice entre blocs.
    """
    monkeypatch.setattr(mapbox_matrix, "_MAX_CHUNK", 2)

    coords = [Coord(float(i), float(i)) for i in range(4)]
    index_by_lat = {float(i): i for i in range(4)}

    def handler(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        # Coordonnées locales dans le chemin de l'URL, dans l'ordre où le
        # provider les a construites (origines d'abord, puis destinations
        # nouvelles) -- on retrouve l'index global via la latitude, qui vaut
        # l'index d'origine par construction des coords de test.
        coord_str = request.url.path.rsplit("/", 1)[-1]
        local_coords = [tuple(map(float, pair.split(","))) for pair in coord_str.split(";")]
        local_to_global = [index_by_lat[lat] for _lon, lat in local_coords]

        source_locals = [int(s) for s in params["sources"].split(";")]
        dest_locals = [int(s) for s in params["destinations"].split(";")]

        n_src, n_dst = len(source_locals), len(dest_locals)
        distances = [[0] * n_dst for _ in range(n_src)]
        durations = [[0] * n_dst for _ in range(n_src)]
        for oi, src_local in enumerate(source_locals):
            global_i = local_to_global[src_local]
            for oj, dst_local in enumerate(dest_locals):
                global_j = local_to_global[dst_local]
                distances[oi][oj] = global_i * 1000 + global_j
                durations[oi][oj] = global_i * 100 + global_j

        return httpx.Response(200, json={"code": "Ok", "distances": distances, "durations": durations})

    with respx.mock() as router:
        router.get(MATRIX_URL_RE).mock(side_effect=handler)
        result = await MapboxMatrixProvider(access_token="tok").matrix(coords)

    assert result.source == "mapbox"
    for i in range(4):
        for j in range(4):
            if i == j:
                continue
            assert result.distances[i][j] == i * 1000 + j
            assert result.durations[i][j] == i * 100 + j


async def test_raises_on_http_error_status():
    with respx.mock() as router:
        router.get(MATRIX_URL_RE).mock(return_value=httpx.Response(403, text="quota exceeded"))
        with pytest.raises(MapboxMatrixError):
            await MapboxMatrixProvider(access_token="tok").matrix([Coord(0, 0), Coord(1, 1)])


async def test_raises_with_message_on_non_ok_code():
    with respx.mock() as router:
        router.get(MATRIX_URL_RE).mock(
            return_value=httpx.Response(200, json={"code": "InvalidInput", "message": "jeton invalide"})
        )
        with pytest.raises(MapboxMatrixError, match="jeton invalide"):
            await MapboxMatrixProvider(access_token="tok").matrix([Coord(0, 0), Coord(1, 1)])


async def test_non_routable_pair_counts_as_missing_not_silently_dropped():
    """Une paire non routable (`distance`/`duration` à `null`) ne doit jamais
    produire une matrice partielle silencieuse -- même philosophie que
    GoogleRoutesError sur ROUTE_NOT_FOUND."""
    with respx.mock() as router:
        router.get(MATRIX_URL_RE).mock(
            return_value=httpx.Response(
                200,
                json={
                    "code": "Ok",
                    "distances": [[0, None], [100, 0]],
                    "durations": [[0, None], [10, 0]],
                },
            )
        )
        with pytest.raises(MapboxMatrixError, match=r"\(0, 1\)"):
            await MapboxMatrixProvider(access_token="tok").matrix([Coord(0, 0), Coord(1, 1)])


async def test_diagonal_does_not_need_to_be_returned():
    """La diagonale (origine == destination) n'a pas besoin d'être renvoyée
    par Mapbox pour être considérée comme complète -- seules les paires
    non-diagonales manquantes déclenchent une erreur."""
    with respx.mock() as router:
        router.get(MATRIX_URL_RE).mock(
            return_value=httpx.Response(
                200,
                json={
                    "code": "Ok",
                    "distances": [[None, 500], [500, None]],
                    "durations": [[None, 60], [65, None]],
                },
            )
        )
        result = await MapboxMatrixProvider(access_token="tok").matrix([Coord(0, 0), Coord(1, 1)])

    assert result.distances[0][0] == 0
    assert result.distances[1][1] == 0
    assert result.distances[0][1] == 500
    assert result.distances[1][0] == 500
