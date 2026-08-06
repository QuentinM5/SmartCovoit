"""Client Nominatim : cache d'abord, rate limit ensuite.

Politique d'usage Nominatim (https://operations.osmfoundation.org/policies/nominatim/) :
1 req/s max et un User-Agent identifiant l'application — les deux sont
respectés ici. Le rate limit est appliqué par process ; avec deux instances
backend actives simultanément le débit cumulé peut monter à ~2 req/s, ce qui
est documenté dans /docs plutôt que résolu par une coordination inter-process
(hors scope V1 — cf. NOMINATIM_URL pour héberger sa propre instance).
"""

from __future__ import annotations

import asyncio
import time

import httpx

from app.geocoding.types import GeocodeCache, GeocodeResult, GeocodingError, normalize_address


class NominatimClient:
    def __init__(
        self,
        base_url: str,
        user_agent: str,
        cache: GeocodeCache,
        min_interval_s: float = 1.0,
        timeout_s: float = 10.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.user_agent = user_agent
        self.cache = cache
        self.min_interval_s = min_interval_s
        self.timeout_s = timeout_s
        self._lock = asyncio.Lock()
        self._last_request_monotonic: float | None = None

    async def geocode(self, address: str) -> GeocodeResult:
        address_norm = normalize_address(address)
        cached = await self.cache.get(address_norm)
        if cached is not None:
            return cached

        result = await self._geocode_live(address)
        await self.cache.set(address_norm, result)
        return result

    async def _geocode_live(self, address: str) -> GeocodeResult:
        await self._respect_rate_limit()

        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                response = await client.get(
                    f"{self.base_url}/search",
                    params={"q": address, "format": "jsonv2", "limit": 1},
                    headers={"User-Agent": self.user_agent},
                )
        except httpx.HTTPError as exc:
            raise GeocodingError(f"Nominatim injoignable : {exc}") from exc

        if response.status_code != 200:
            raise GeocodingError(f"Nominatim a répondu {response.status_code}")

        try:
            payload = response.json()
        except ValueError as exc:
            raise GeocodingError("Réponse Nominatim non JSON") from exc

        if not payload:
            raise GeocodingError(f"Adresse introuvable : {address!r}")

        first = payload[0]
        try:
            return GeocodeResult(
                lat=float(first["lat"]),
                lon=float(first["lon"]),
                display_name=first.get("display_name", address),
            )
        except (KeyError, ValueError, TypeError) as exc:
            raise GeocodingError("Réponse Nominatim malformée") from exc

    async def _respect_rate_limit(self) -> None:
        async with self._lock:
            now = time.monotonic()
            if self._last_request_monotonic is not None:
                elapsed = now - self._last_request_monotonic
                wait = self.min_interval_s - elapsed
                if wait > 0:
                    await asyncio.sleep(wait)
            self._last_request_monotonic = time.monotonic()
