"""Point d'entrée FastAPI.

Les singletons applicatifs (géocodeur, provider de distances) sont construits
une fois au démarrage et posés sur `app.state` — cf. app/api/deps.py pour
pourquoi (le rate-limiter Nominatim doit être partagé entre requêtes).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.db.base import get_sessionmaker
from app.db.geocode_cache_repo import SqlGeocodeCache
from app.distance.fallback import FallbackMatrixProvider
from app.distance.google_routes import GoogleRoutesProvider
from app.distance.haversine import HaversineProvider
from app.distance.osrm import OSRMProvider
from app.geocoding.nominatim import NominatimClient


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()

    cache = SqlGeocodeCache(get_sessionmaker())
    app.state.geocoder = NominatimClient(
        base_url=settings.nominatim_url,
        user_agent=settings.nominatim_user_agent,
        cache=cache,
    )

    osrm = OSRMProvider(base_url=settings.osrm_url) if settings.osrm_url else None
    google = (
        GoogleRoutesProvider(api_key=settings.google_routes_api_key)
        if settings.google_routes_api_key
        else None
    )
    app.state.matrix_provider = FallbackMatrixProvider(
        osrm=osrm,
        haversine=HaversineProvider(road_factor=settings.haversine_road_factor),
        google=google,
    )

    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="SmartCovoit API",
        description="Solveur de covoiturage optimisé pour événements de groupe.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)
    return app


app = create_app()
