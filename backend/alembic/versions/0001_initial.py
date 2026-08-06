"""Schéma initial : events, drivers, passengers, solutions, geocode_cache.

Revision ID: 0001
Revises:
Create Date: 2026-08-05

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False : le type est créé/détruit explicitement ci-dessous.
# Sans ça, `op.create_table` déclenche *aussi* sa propre CREATE TYPE via
# l'événement before_create de la colonne, en plus de l'appel explicite —
# doublon qui casse la migration avec "type already exists".
direction_enum = postgresql.ENUM("ramassage", "dispersion", name="direction", create_type=False)
_direction_enum_creatable = postgresql.ENUM("ramassage", "dispersion", name="direction")


def upgrade() -> None:
    _direction_enum_creatable.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("direction", direction_enum, nullable=False),
        sa.Column("depot_address", sa.String(500), nullable=False),
        sa.Column("depot_lat", sa.Float, nullable=False),
        sa.Column("depot_lon", sa.Float, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "drivers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("seats", sa.Integer, nullable=False),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column("lat", sa.Float, nullable=False),
        sa.Column("lon", sa.Float, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_drivers_event_id", "drivers", ["event_id"])

    op.create_table(
        "passengers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column("lat", sa.Float, nullable=False),
        sa.Column("lon", sa.Float, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_passengers_event_id", "passengers", ["event_id"])

    op.create_table(
        "solutions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("total_distance_m", sa.Integer, nullable=False),
        sa.Column("matrix_source", sa.String(20), nullable=False),
        sa.Column("fallback_reason", sa.String(500), nullable=True),
        sa.Column("payload", postgresql.JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_solutions_event_id", "solutions", ["event_id"])

    op.create_table(
        "geocode_cache",
        sa.Column("address_norm", sa.String(500), primary_key=True),
        sa.Column("lat", sa.Float, nullable=False),
        sa.Column("lon", sa.Float, nullable=False),
        sa.Column("display_name", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("geocode_cache")
    op.drop_index("ix_solutions_event_id", table_name="solutions")
    op.drop_table("solutions")
    op.drop_index("ix_passengers_event_id", table_name="passengers")
    op.drop_table("passengers")
    op.drop_index("ix_drivers_event_id", table_name="drivers")
    op.drop_table("drivers")
    op.drop_table("events")
    _direction_enum_creatable.drop(op.get_bind(), checkfirst=True)
