"""Barème de partage des frais par événement, journal d'événements métier
(events_log) et index composite manquant sur solutions.

Purement additive : colonnes nullables, une nouvelle table, des index. Le
code déployé avant cette migration continue de fonctionner sans y toucher
(important car Railway ne migre pas la base lui-même — seul TrueNAS exécute
`alembic upgrade head` au démarrage, cf. docs/deploiement.md) ; c'est donc
cette migration qui doit être appliquée AVANT tout redéploiement de code qui
en dépend, jamais l'inverse.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-03

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("events", sa.Column("fuel_price_per_l", sa.Float(), nullable=True))
    op.add_column("events", sa.Column("consumption_l_per_100km", sa.Float(), nullable=True))

    op.create_table(
        "events_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # server_default=now() plutôt qu'une valeur applicative : ordonnancement
        # entre deux instances backend aux horloges potentiellement décalées.
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("instance", sa.String(20), nullable=False),
        sa.Column(
            "event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("props", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_events_log_name_created_at", "events_log", ["name", "created_at"])
    op.create_index("ix_events_log_event_id", "events_log", ["event_id"])

    # Manquant alors que _load_latest_solution_record_or_404 (routes.py) trie
    # exactement là-dessus pour prendre la solution la plus récente d'un
    # (event, direction).
    op.create_index(
        "ix_solutions_event_direction_created", "solutions", ["event_id", "direction", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_solutions_event_direction_created", table_name="solutions")

    op.drop_index("ix_events_log_event_id", table_name="events_log")
    op.drop_index("ix_events_log_name_created_at", table_name="events_log")
    op.drop_table("events_log")

    op.drop_column("events", "consumption_l_per_100km")
    op.drop_column("events", "fuel_price_per_l")
