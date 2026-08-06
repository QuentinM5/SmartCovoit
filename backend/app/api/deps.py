"""Dépendances FastAPI.

`get_geocoder` et `get_matrix_provider` lisent des singletons posés sur
`app.state` au démarrage (cf. app/main.py) plutôt que d'en construire un
neuf par requête : le rate-limiter de `NominatimClient` n'a de sens que
partagé entre toutes les requêtes du process.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.distance.fallback import FallbackMatrixProvider
from app.geocoding.nominatim import NominatimClient


async def get_db() -> AsyncIterator[AsyncSession]:
    async for session in get_session():
        yield session


def get_geocoder(request: Request) -> NominatimClient:
    return request.app.state.geocoder


def get_matrix_provider(request: Request) -> FallbackMatrixProvider:
    return request.app.state.matrix_provider
