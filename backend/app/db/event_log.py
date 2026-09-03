"""Écriture du journal d'événements métier (`events_log`) — la moitié serveur
de la télémétrie, complémentaire à PostHog côté navigateur
(frontend/lib/telemetry.ts) : un fait n'est journalisé qu'à l'endroit où il
est vrai, jamais des deux côtés à la fois.

Aucune donnée personnelle dans `props` : uniquement des ids et des
compteurs (cf. app.db.models.EventLog).
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import EventLog

logger = logging.getLogger(__name__)


def log_event(
    db: AsyncSession,
    name: str,
    *,
    instance: str,
    event_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    **props: object,
) -> None:
    """Ajoute à la session déjà ouverte, sans committer : le commit métier
    qui suit (déjà prévu par l'appelant) écrit la ligne de journal avec le
    reste — atomique, sans aller-retour réseau supplémentaire."""
    db.add(
        EventLog(
            id=uuid.uuid4(),
            name=name,
            instance=instance,
            event_id=event_id,
            user_id=user_id,
            props=props,
        )
    )


async def log_event_now(
    db: AsyncSession,
    name: str,
    *,
    instance: str,
    event_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    **props: object,
) -> None:
    """Pour un fait qui survient sur un chemin qui ne committe jamais de
    transaction métier ensuite (ex. une connexion refusée) : commit dédié,
    erreur avalée — une panne de télémétrie ne doit jamais transformer une
    réponse propre (401, 422, 429) en 500."""
    try:
        log_event(db, name, instance=instance, event_id=event_id, user_id=user_id, **props)
        await db.commit()
    except Exception:
        logger.warning("Écriture du journal d'événements échouée (%s)", name, exc_info=True)
        await db.rollback()
