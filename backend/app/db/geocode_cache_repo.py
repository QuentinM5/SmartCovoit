"""Implémentation SQLAlchemy de `GeocodeCache` (protocole défini dans app.geocoding.types).

Ouvre sa propre session à chaque `get`/`set` plutôt que de dépendre d'une
session injectée par requête FastAPI : `NominatimClient` est un singleton
applicatif (son rate-limiter n'a de sens que partagé entre requêtes), donc
son cache doit pouvoir vivre indépendamment du cycle de vie d'une requête
HTTP.
"""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import GeocodeCacheEntry
from app.geocoding.types import GeocodeResult


class SqlGeocodeCache:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
        self._sessionmaker = sessionmaker

    async def get(self, address_norm: str) -> GeocodeResult | None:
        async with self._sessionmaker() as session:
            entry = await session.get(GeocodeCacheEntry, address_norm)
            if entry is None:
                return None
            return GeocodeResult(lat=entry.lat, lon=entry.lon, display_name=entry.display_name)

    async def set(self, address_norm: str, result: GeocodeResult) -> None:
        async with self._sessionmaker() as session:
            stmt = (
                pg_insert(GeocodeCacheEntry)
                .values(
                    address_norm=address_norm,
                    lat=result.lat,
                    lon=result.lon,
                    display_name=result.display_name,
                )
                .on_conflict_do_nothing(index_elements=["address_norm"])
            )
            await session.execute(stmt)
            await session.commit()
