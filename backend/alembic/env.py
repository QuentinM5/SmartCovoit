"""Migrations async — la base est partagée entre deux instances backend, donc
`Base.metadata.create_all()` au démarrage serait une source de course. Toute
évolution de schéma passe par une migration explicite.

L'URL de connexion vient de `DATABASE_URL` (via app.core.config), jamais de
`alembic.ini` — cohérent avec la règle "aucune valeur sensible en dur".
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.db.base import Base
from app.db.models import (  # noqa: F401  (enregistre les modèles sur Base.metadata)
    Comment,
    Driver,
    Event,
    GeocodeCacheEntry,
    Passenger,
    SolutionRecord,
    User,
)
from app.db.url import normalize_database_url

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_connection_url_and_args() -> tuple[str, dict[str, object]]:
    settings = get_settings()
    conn = normalize_database_url(settings.database_url)
    return conn.url, conn.connect_args


def run_migrations_offline() -> None:
    url, _ = get_connection_url_and_args()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    url, connect_args = get_connection_url_and_args()
    connectable = async_engine_from_config(
        {"sqlalchemy.url": url},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
