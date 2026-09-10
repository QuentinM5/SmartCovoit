"""Confidentialité d'événement avec approbation des demandes d'accès.

`events.access_mode` : 'open' (défaut, comportement actuel inchangé) ou
'approval'. Table `access_requests` : une ligne par (événement, compte) qui
a demandé l'accès à un événement en mode 'approval' — contrainte unique sur
la paire, un statut (pending/approved/denied) réutilisé plutôt qu'une
nouvelle ligne à chaque nouvelle demande de la même personne.

Purement additive : `access_mode` nullable... non, NOT NULL avec un défaut
serveur, parce que contrairement à currency/fuel_price_per_l ce n'est pas
une valeur qu'on laisse au client interpréter (« nul = comportement par
défaut côté client ») — c'est un champ d'autorisation consulté côté serveur
à chaque requête, il doit toujours avoir une valeur sans ambiguïté. Le code
déployé avant cette migration continue de fonctionner sans y toucher (aucune
route existante ne lit encore cette colonne) ; à appliquer sur Neon AVANT
tout redéploiement de code qui en dépend, comme les migrations précédentes.

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-10

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("access_mode", sa.String(20), nullable=False, server_default="open"),
    )

    op.create_table(
        "access_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False
        ),
        # CASCADE (pas SET NULL comme Driver.user_id/Passenger.user_id) :
        # une demande d'accès sans compte connu n'a pas de sens, contrairement
        # à une inscription dont le compte a été supprimé après coup.
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("event_id", "user_id", name="uq_access_requests_event_user"),
    )
    op.create_index("ix_access_requests_event_id", "access_requests", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_access_requests_event_id", table_name="access_requests")
    op.drop_table("access_requests")
    op.drop_column("events", "access_mode")
