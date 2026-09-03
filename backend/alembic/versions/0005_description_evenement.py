"""Remplace les commentaires multi-auteurs par un message unique de
l'organisateur, saisi à la création de l'événement.

La table `comments` (ajoutée par 0004) partait d'une mauvaise lecture du
besoin : un fil de discussion ouvert à tous les inscrits, alors que ce qui
était demandé est un simple champ texte rempli par l'organisateur à la
création (consignes de rendez-vous, etc.) — cf. `Event.description`.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-03

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("events", sa.Column("description", sa.String(2000), nullable=True))

    op.drop_index("ix_comments_author_id", table_name="comments")
    op.drop_index("ix_comments_event_id", table_name="comments")
    op.drop_table("comments")


def downgrade() -> None:
    # Recrée la table telle qu'ajoutée par 0004 — les commentaires perdus à
    # l'upgrade ne sont pas récupérables, seule la structure revient.
    op.create_table(
        "comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "author_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("body", sa.String(2000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_comments_event_id", "comments", ["event_id"])
    op.create_index("ix_comments_author_id", "comments", ["author_id"])

    op.drop_column("events", "description")
