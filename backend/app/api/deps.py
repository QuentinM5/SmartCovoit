"""Dépendances FastAPI.

`get_geocoder` et `get_matrix_provider` lisent des singletons posés sur
`app.state` au démarrage (cf. app/main.py) plutôt que d'en construire un
neuf par requête : le rate-limiter de `NominatimClient` n'a de sens que
partagé entre toutes les requêtes du process.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import jwt
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.security import verify_session_token
from app.db.base import get_session
from app.db.models import User
from app.distance.fallback import FallbackMatrixProvider
from app.geocoding.nominatim import NominatimClient


async def get_db() -> AsyncIterator[AsyncSession]:
    async for session in get_session():
        yield session


def get_geocoder(request: Request) -> NominatimClient:
    return request.app.state.geocoder


def get_matrix_provider(request: Request) -> FallbackMatrixProvider:
    return request.app.state.matrix_provider


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    """Authentification par en-tête `Authorization: Bearer <jeton>`, pas par
    cookie — le frontend et l'API sont sur des domaines différents (cf.
    plan), un cookie de session y serait tiers et bloqué par défaut par
    Safari. Le worker de failover transmet l'en-tête tel quel, aucun
    changement n'y est nécessaire.
    """
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Authentification requise.")
    try:
        user_id = verify_session_token(token, settings.jwt_secret)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Session invalide ou expirée. Reconnecte-toi.") from None
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Compte introuvable.")
    return user
