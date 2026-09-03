"""Enrichissement des événements : date, commentaires, image de couverture.

`event_date` suit le patron nullable -> backfill -> NOT NULL (contrairement
à `owner_id` dans 0003, une date manquante peut raisonnablement être
approximée par la date de création pour l'historique). `cover_image` et
`cover_image_content_type` restent nullables (aucun événement existant n'a
d'image à backfiller). `comments` est une nouvelle table, mirroring
`drivers`/`passengers` mais avec un auteur obligatoire (commenter exige
désormais un compte, cf. migration 0003).

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-02

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("events", sa.Column("event_date", sa.Date(), nullable=True))
    op.execute("UPDATE events SET event_date = created_at::date")
    op.alter_column("events", "event_date", nullable=False)

    op.add_column("events", sa.Column("cover_image", sa.LargeBinary(), nullable=True))
    op.add_column("events", sa.Column("cover_image_content_type", sa.String(50), nullable=True))

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


def downgrade() -> None:
    op.drop_index("ix_comments_author_id", table_name="comments")
    op.drop_index("ix_comments_event_id", table_name="comments")
    op.drop_table("comments")

    op.drop_column("events", "cover_image_content_type")
    op.drop_column("events", "cover_image")

    op.alter_column("events", "event_date", nullable=True)
    op.drop_column("events", "event_date")
