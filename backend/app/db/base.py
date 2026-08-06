"""Engine et sessions SQLAlchemy async.

Construction paresseuse (`lru_cache`) : rien ne se connecte tant qu'une
requête n'utilise pas réellement `get_session`. Important pour les tests
d'API qui remplacent cette dépendance par un double en mémoire — l'import de
`app.main` ne doit jamais tenter de joindre une vraie base.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings
from app.db.url import normalize_database_url


class Base(DeclarativeBase):
    pass


@lru_cache
def get_engine() -> AsyncEngine:
    settings = get_settings()
    conn = normalize_database_url(settings.database_url)
    return create_async_engine(conn.url, connect_args=conn.connect_args, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session
