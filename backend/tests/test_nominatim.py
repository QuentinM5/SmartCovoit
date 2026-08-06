"""Tests du client Nominatim : cache, rate limit, adresse introuvable."""

from __future__ import annotations

import time

import httpx
import pytest
import respx

from app.geocoding.nominatim import NominatimClient
from app.geocoding.types import GeocodeResult, GeocodingError, normalize_address


class InMemoryCache:
    def __init__(self) -> None:
        self.store: dict[str, GeocodeResult] = {}

    async def get(self, address_norm: str) -> GeocodeResult | None:
        return self.store.get(address_norm)

    async def set(self, address_norm: str, result: GeocodeResult) -> None:
        self.store[address_norm] = result


NOMINATIM_OK = [
    {"lat": "48.8566", "lon": "2.3522", "display_name": "Paris, France"},
]


async def test_geocode_success_populates_cache():
    cache = InMemoryCache()
    with respx.mock(base_url="http://nominatim.local") as router:
        router.get("/search").mock(return_value=httpx.Response(200, json=NOMINATIM_OK))
        client = NominatimClient(
            base_url="http://nominatim.local", user_agent="test-agent", cache=cache, min_interval_s=0
        )
        result = await client.geocode("Paris")

    assert result.lat == pytest.approx(48.8566)
    assert result.lon == pytest.approx(2.3522)
    assert cache.store[normalize_address("Paris")] == result


async def test_cache_hit_skips_network_call():
    cache = InMemoryCache()
    cached = GeocodeResult(lat=1.0, lon=2.0, display_name="Cached Place")
    await cache.set(normalize_address("Somewhere"), cached)

    with respx.mock(base_url="http://nominatim.local", assert_all_called=False) as router:
        route = router.get("/search").mock(return_value=httpx.Response(200, json=NOMINATIM_OK))
        client = NominatimClient(base_url="http://nominatim.local", user_agent="test-agent", cache=cache)
        result = await client.geocode("Somewhere")

    assert result == cached
    assert route.call_count == 0


async def test_address_not_found_raises_geocoding_error():
    cache = InMemoryCache()
    with respx.mock(base_url="http://nominatim.local") as router:
        router.get("/search").mock(return_value=httpx.Response(200, json=[]))
        client = NominatimClient(
            base_url="http://nominatim.local", user_agent="test-agent", cache=cache, min_interval_s=0
        )
        with pytest.raises(GeocodingError, match="introuvable"):
            await client.geocode("Adresse qui n'existe pas")


async def test_nominatim_unreachable_raises_geocoding_error():
    cache = InMemoryCache()
    with respx.mock(base_url="http://nominatim.local") as router:
        router.get("/search").mock(side_effect=httpx.ConnectError("refused"))
        client = NominatimClient(
            base_url="http://nominatim.local", user_agent="test-agent", cache=cache, min_interval_s=0
        )
        with pytest.raises(GeocodingError, match="injoignable"):
            await client.geocode("Paris")


async def test_rate_limit_spaces_out_consecutive_calls():
    cache = InMemoryCache()
    with respx.mock(base_url="http://nominatim.local") as router:
        router.get("/search").mock(return_value=httpx.Response(200, json=NOMINATIM_OK))
        client = NominatimClient(
            base_url="http://nominatim.local", user_agent="test-agent", cache=cache, min_interval_s=0.2
        )
        start = time.monotonic()
        await client.geocode("Adresse A")
        await client.geocode("Adresse B")  # adresse différente -> pas de cache hit
        elapsed = time.monotonic() - start

    assert elapsed >= 0.2


async def test_user_agent_header_is_sent():
    cache = InMemoryCache()
    with respx.mock(base_url="http://nominatim.local") as router:
        route = router.get("/search").mock(return_value=httpx.Response(200, json=NOMINATIM_OK))
        client = NominatimClient(
            base_url="http://nominatim.local",
            user_agent="smartcovoit/1.0 (contact@example.com)",
            cache=cache,
            min_interval_s=0,
        )
        await client.geocode("Paris")

    assert route.calls.last.request.headers["User-Agent"] == "smartcovoit/1.0 (contact@example.com)"
