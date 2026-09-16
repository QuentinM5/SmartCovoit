"""Tests du client Mapbox Directions : conversion GeoJSON -> (lat, lon), et
gestion d'erreurs (un échec ici ne doit jamais casser un calcul de tournées,
cf. docstring de mapbox_directions.py -- mais le provider lui-même doit bien
lever, c'est l'appelant qui absorbe).
"""

from __future__ import annotations

import re

import httpx
import pytest
import respx

from app.distance.mapbox_directions import MapboxDirectionsError, MapboxDirectionsProvider
from app.distance.types import Coord

DIRECTIONS_URL_RE = re.compile(r"https://api\.mapbox\.com/directions/v5/mapbox/driving-traffic/.*")

PARIS = Coord(48.8566, 2.3522)
LYON = Coord(45.7640, 4.8357)


async def test_single_coordinate_is_trivial_without_network_call():
    provider = MapboxDirectionsProvider(access_token="tok")
    route = await provider.route([PARIS])

    assert route.duration_s == 0
    assert route.geometry == []


async def test_route_converts_geojson_to_lat_lon():
    with respx.mock() as router:
        router.get(DIRECTIONS_URL_RE).mock(
            return_value=httpx.Response(
                200,
                json={
                    "code": "Ok",
                    "routes": [
                        {
                            "duration": 4321.4,
                            # GeoJSON est en (lon, lat) : la conversion vers (lat, lon) est le cœur du test.
                            "geometry": {"coordinates": [[2.3522, 48.8566], [3.0, 48.0], [4.8357, 45.7640]]},
                        }
                    ],
                },
            )
        )
        route = await MapboxDirectionsProvider(access_token="tok").route([PARIS, LYON])

    assert route.duration_s == 4321
    assert route.geometry[0] == [48.8566, 2.3522]
    assert route.geometry[-1] == [45.7640, 4.8357]


async def test_raises_on_http_error_status():
    with respx.mock() as router:
        router.get(DIRECTIONS_URL_RE).mock(return_value=httpx.Response(403, text="quota exceeded"))
        with pytest.raises(MapboxDirectionsError):
            await MapboxDirectionsProvider(access_token="tok").route([PARIS, LYON])


async def test_raises_with_message_on_non_ok_code():
    with respx.mock() as router:
        router.get(DIRECTIONS_URL_RE).mock(
            return_value=httpx.Response(200, json={"code": "NoRoute", "message": "aucun itinéraire"})
        )
        with pytest.raises(MapboxDirectionsError, match="aucun itinéraire"):
            await MapboxDirectionsProvider(access_token="tok").route([PARIS, LYON])


async def test_raises_when_no_route_returned():
    with respx.mock() as router:
        router.get(DIRECTIONS_URL_RE).mock(return_value=httpx.Response(200, json={"code": "Ok", "routes": []}))
        with pytest.raises(MapboxDirectionsError, match="Aucun tracé"):
            await MapboxDirectionsProvider(access_token="tok").route([PARIS, LYON])


async def test_raises_on_malformed_route():
    with respx.mock() as router:
        router.get(DIRECTIONS_URL_RE).mock(
            return_value=httpx.Response(200, json={"code": "Ok", "routes": [{"duration": 100}]})  # geometry manquante
        )
        with pytest.raises(MapboxDirectionsError, match="malformé"):
            await MapboxDirectionsProvider(access_token="tok").route([PARIS, LYON])
