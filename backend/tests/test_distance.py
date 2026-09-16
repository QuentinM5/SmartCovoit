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
from app.distance.google_routes import GoogleRoutesProvider
from app.distance.haversine import HaversineProvider, haversine_m
from app.distance.mapbox_matrix import MapboxMatrixProvider
from app.distance.osrm import OSRMProvider
from app.distance.types import Coord

GOOGLE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
MAPBOX_MATRIX_URL_RE = re.compile(r"https://api\.mapbox\.com/directions-matrix/v1/mapbox/driving/.*")

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
            return_value=httpx.Response(
                200,
                json={
                    "code": "Ok",
                    "distances": [[0, 391000], [391000, 0]],
                    "durations": [[0, 14400], [14400, 0]],
                },
            )
        )
        provider = OSRMProvider(base_url="http://osrm.local")
        result = await provider.matrix(COORDS)

    assert result.source == "osrm"
    assert result.distances == [[0, 391000], [391000, 0]]
    assert result.durations == [[0, 14400], [14400, 0]]


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
            return_value=httpx.Response(
                200,
                json={
                    "code": "Ok",
                    "distances": [[0, None], [None, 0]],
                    "durations": [[0, 100], [100, 0]],
                },
            )
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


# --- Chaîne à quatre niveaux : Google -> OSRM -> Mapbox -> Haversine -------

_GOOGLE_OK = [
    {"originIndex": 0, "destinationIndex": 1, "distanceMeters": 500, "duration": "60s", "condition": "ROUTE_EXISTS"},
    {"originIndex": 1, "destinationIndex": 0, "distanceMeters": 500, "duration": "65s", "condition": "ROUTE_EXISTS"},
]

_MAPBOX_OK = {
    "code": "Ok",
    "distances": [[0, 392000], [392000, 0]],
    "durations": [[0, 14500], [14500, 0]],
}


def _full_chain_provider(**overrides) -> FallbackMatrixProvider:
    """Provider avec les quatre niveaux configurés par défaut -- chaque test
    ne surcharge que ce qu'il veut faire échouer/absenter."""
    defaults = dict(
        osrm=OSRMProvider(base_url="http://osrm.local"),
        google=GoogleRoutesProvider(api_key="k"),
        mapbox=MapboxMatrixProvider(access_token="tok"),
    )
    defaults.update(overrides)
    return FallbackMatrixProvider(**defaults)


async def test_fallback_prefers_google_when_configured():
    with respx.mock() as router:
        router.post(GOOGLE_MATRIX_URL).mock(return_value=httpx.Response(200, json=_GOOGLE_OK))
        provider = _full_chain_provider()
        result = await provider.matrix(COORDS)

    assert result.source == "google"
    assert result.durations == [[0, 60], [65, 0]]


async def test_fallback_from_google_to_osrm_when_google_fails():
    with respx.mock() as router:
        router.post(GOOGLE_MATRIX_URL).mock(return_value=httpx.Response(403, text="quota"))
        router.get(re.compile(r"http://osrm\.local/.*")).mock(
            return_value=httpx.Response(
                200,
                json={
                    "code": "Ok",
                    "distances": [[0, 391000], [391000, 0]],
                    "durations": [[0, 14400], [14400, 0]],
                },
            )
        )
        provider = _full_chain_provider()
        result = await provider.matrix(COORDS)

    assert result.source == "osrm"
    # OSRM a réussi : pas de raison à afficher, seul un échec du DERNIER
    # niveau essayé (avant Haversine) en porte une.
    assert result.fallback_reason is None


async def test_fallback_from_google_and_osrm_to_mapbox():
    with respx.mock() as router:
        router.post(GOOGLE_MATRIX_URL).mock(return_value=httpx.Response(403, text="quota"))
        router.get(re.compile(r"http://osrm\.local/.*")).mock(side_effect=httpx.ConnectError("refused"))
        router.get(MAPBOX_MATRIX_URL_RE).mock(return_value=httpx.Response(200, json=_MAPBOX_OK))
        provider = _full_chain_provider()
        result = await provider.matrix(COORDS)

    assert result.source == "mapbox"
    # Mapbox a réussi : pas de raison à afficher, même logique que pour OSRM.
    assert result.fallback_reason is None
    assert result.durations == [[0, 14500], [14500, 0]]


async def test_fallback_from_google_osrm_and_mapbox_to_haversine():
    with respx.mock() as router:
        router.post(GOOGLE_MATRIX_URL).mock(return_value=httpx.Response(403, text="quota"))
        router.get(re.compile(r"http://osrm\.local/.*")).mock(side_effect=httpx.ConnectError("refused"))
        router.get(MAPBOX_MATRIX_URL_RE).mock(return_value=httpx.Response(401, text="invalid token"))
        provider = _full_chain_provider()
        result = await provider.matrix(COORDS)

    assert result.source == "haversine"
    # Le dernier niveau essayé avant Haversine est Mapbox : sa raison prime.
    assert result.fallback_reason is not None
    assert "401" in result.fallback_reason
    assert result.distances[0][1] == haversine_m(PARIS, LYON)


async def test_fallback_uses_mapbox_when_google_and_osrm_absent():
    """Mapbox répare le secours Heroku (sans OSRM, sans clé Google) : seul
    niveau payant configuré, il doit être utilisé directement, sans warning
    ni fallback_reason -- rien n'a échoué avant lui."""
    with respx.mock() as router:
        router.get(MAPBOX_MATRIX_URL_RE).mock(return_value=httpx.Response(200, json=_MAPBOX_OK))
        provider = FallbackMatrixProvider(osrm=None, google=None, mapbox=MapboxMatrixProvider(access_token="tok"))
        result = await provider.matrix(COORDS)

    assert result.source == "mapbox"
    assert result.fallback_reason is None
    assert result.durations == [[0, 14500], [14500, 0]]


async def test_fallback_no_reason_when_no_paid_level_configured():
    """Invariant à préserver avec le quatrième niveau : sans AUCUN niveau
    payant configuré (google/osrm/mapbox à None), Haversine est utilisé
    directement, sans fallback_reason -- ce n'est pas une panne."""
    provider = FallbackMatrixProvider(osrm=None, google=None, mapbox=None)
    result = await provider.matrix(COORDS)

    assert result.source == "haversine"
    assert result.fallback_reason is None


# --- Tracé routier (route_geometry) ---------------------------------------

OSRM_ROUTE_OK = {
    "code": "Ok",
    # GeoJSON est en (lon, lat) : la conversion vers (lat, lon) est le cœur du test.
    "routes": [{"geometry": {"coordinates": [[2.3522, 48.8566], [3.0, 48.0], [4.8357, 45.7640]]}}],
}


async def test_route_geometry_converts_geojson_to_lat_lon():
    with respx.mock(base_url="http://osrm.local") as router:
        router.get(re.compile(r"/route/.*")).mock(return_value=httpx.Response(200, json=OSRM_ROUTE_OK))
        provider = OSRMProvider(base_url="http://osrm.local")
        geometry = await provider.route_geometry(COORDS)

    assert geometry[0] == [48.8566, 2.3522]
    assert geometry[-1] == [45.7640, 4.8357]


async def test_route_geometry_is_none_when_osrm_not_configured():
    provider = FallbackMatrixProvider(osrm=None)
    assert await provider.route_geometry(COORDS) is None


async def test_route_geometry_is_none_when_osrm_fails():
    """Un tracé indisponible ne doit jamais faire échouer un calcul : la carte
    retombe simplement sur des lignes droites."""
    with respx.mock(base_url="http://osrm.local") as router:
        router.get(re.compile(r"/route/.*")).mock(side_effect=httpx.ConnectError("refused"))
        provider = FallbackMatrixProvider(osrm=OSRMProvider(base_url="http://osrm.local"))
        assert await provider.route_geometry(COORDS) is None


async def test_route_geometry_is_none_when_osrm_returns_no_route():
    with respx.mock(base_url="http://osrm.local") as router:
        router.get(re.compile(r"/route/.*")).mock(
            return_value=httpx.Response(200, json={"code": "NoRoute", "routes": []})
        )
        provider = FallbackMatrixProvider(osrm=OSRMProvider(base_url="http://osrm.local"))
        assert await provider.route_geometry(COORDS) is None


async def test_route_geometry_empty_for_single_point():
    provider = OSRMProvider(base_url="http://osrm.local")
    assert await provider.route_geometry([PARIS]) == []
