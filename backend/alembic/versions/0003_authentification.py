"""Authentification : comptes utilisateurs (mot de passe et/ou Google) et
rattachement des événements/inscriptions à leur créateur.

`owner_id` sur `events` et `user_id` sur `drivers`/`passengers` sont ajoutés
NULLABLE, sans backfill : aucun utilisateur réel n'existe pour rattacher les
lignes déjà présentes en base — en inventer un serait pire que ne rien
mettre. Les anciens événements restent donc utilisables sans propriétaire
(la matrice d'autorisation applicative, cf. app/api/routes.py, traite un
`owner_id`/`user_id` nul comme "ouvert" à tout compte connecté), alors que
tout événement/inscription créé après cette migration en a systématiquement
un.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-02

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        # Nul si le compte n'a jamais utilisé de mot de passe (Google
        # uniquement) ; google_sub nul si jamais utilisé Google.
        sa.Column("password_hash", sa.String(200), nullable=True),
        sa.Column("google_sub", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=True)

    op.add_column("events", sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_events_owner_id_users", "events", "users", ["owner_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_events_owner_id", "events", ["owner_id"])

    for table in ("drivers", "passengers"):
        op.add_column(table, sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_user_id_users", table, "users", ["user_id"], ["id"], ondelete="SET NULL"
        )
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])


def downgrade() -> None:
    for table in ("drivers", "passengers"):
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_constraint(f"fk_{table}_user_id_users", table, type_="foreignkey")
        op.drop_column(table, "user_id")

    op.drop_index("ix_events_owner_id", table_name="events")
    op.drop_constraint("fk_events_owner_id_users", "events", type_="foreignkey")
    op.drop_column("events", "owner_id")

    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
