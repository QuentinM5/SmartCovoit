"""Tests du provider de distances : OSRM en priorité, repli Haversine transparent.

Couvre les cas du brief : OSRM injoignable -> repli + log, OSRM renvoie une
paire non routable -> repli, OSRM_URL vide -> Haversine direct sans warning.

`asyncio_mode = "auto"` (pyproject.toml) fait tourner les `async def test_*`
sans marqueur explicite.
"""

from __future__ import annotations

import re

import httpx
import respx

from app.distance.fallback import FallbackMatrixProvider
from app.distance.haversine import HaversineProvider, haversine_m
from app.distance.osrm import OSRMProvider
from app.distance.types import Coord

PARIS = Coord(48.8566, 2.3522)
LYON = Coord(45.7640, 4.8357)
COORDS = [PARIS, LYON]


async def test_haversine_matrix_is_symmetric_with_zero_diagonal():
    provider = HaversineProvider()
    result = await provider.matrix(COORDS)

    assert result.source == "haversine"
    assert result.distances[0][0] == 0
    assert result.distances[1][1] == 0
    assert result.distances[0][1] == result.distances[1][0]
    assert result.distances[0][1] == haversine_m(PARIS, LYON)


async def test_road_factor_scales_distance_uniformly():
    base_result = await HaversineProvider(road_factor=1.0).matrix(COORDS)
    scaled_result = await HaversineProvider(road_factor=1.3).matrix(COORDS)

    assert scaled_result.distances[0][1] == round(base_result.distances[0][1] * 1.3)


async def test_osrm_success_returns_osrm_source():
    with respx.mock(base_url="http://osrm.local") as router:
        router.get("/table/v1/driving/2.3522,48.8566;4.8357,45.764").mock(
            return_value=httpx.Response(200, json={"code": "Ok", "distances": [[0, 391000], [391000, 0]]})
        )
        provider = OSRMProvider(base_url="http://osrm.local")
        result = await provider.matrix(COORDS)

    assert result.source == "osrm"
    assert result.distances == [[0, 391000], [391000, 0]]


async def test_fallback_switches_to_haversine_when_osrm_unreachable():
    with respx.mock(base_url="http://osrm.local") as router:
        router.get(re.compile(r".*")).mock(side_effect=httpx.ConnectError("refused"))
        osrm = OSRMProvider(base_url="http://osrm.local")
        provider = FallbackMatrixProvider(osrm=osrm)
        result = await provider.matrix(COORDS)

    assert result.source == "haversine"
    assert result.fallback_reason is not None
    assert result.distances[0][1] == haversine_m(PARIS, LYON)


async def test_fallback_switches_to_haversine_on_unroutable_pair():
    with respx.mock(base_url="http://osrm.local") as router:
        router.get(re.compile(r".*")).mock(
            return_value=httpx.Response(200, json={"code": "Ok", "distances": [[0, None], [None, 0]]})
        )
        osrm = OSRMProvider(base_url="http://osrm.local")
        provider = FallbackMatrixProvider(osrm=osrm)
        result = await provider.matrix(COORDS)

    assert result.source == "haversine"
    assert "non routable" in result.fallback_reason


async def test_fallback_goes_directly_to_haversine_when_osrm_not_configured():
    provider = FallbackMatrixProvider(osrm=None)
    result = await provider.matrix(COORDS)

    assert result.source == "haversine"
    assert result.fallback_reason is None
