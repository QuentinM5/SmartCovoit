"""Devise du partage des frais, par événement.

Purement additive : une colonne nullable. Nulle = jamais choisie par
l'organisateur, le client applique alors EUR par défaut (cf.
frontend/lib/cost.ts DEFAULT_CURRENCY) — même principe de défaut partagé que
fuel_price_per_l/consumption_l_per_100km (migration 0006). À appliquer sur
Neon AVANT tout redéploiement de code qui en dépend (Railway ne migre pas la
base lui-même, cf. docs/deploiement.md).

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-03

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # VARCHAR(3) : codes ISO-4217 (EUR, CAD, USD, CHF, GBP), validés côté
    # application (schemas.Currency) plutôt que par une contrainte CHECK —
    # la liste courte est un choix produit, pas une invariant de la donnée.
    op.add_column("events", sa.Column("currency", sa.String(3), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "currency")
