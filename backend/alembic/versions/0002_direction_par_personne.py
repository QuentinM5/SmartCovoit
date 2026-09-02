"""Le sens du trajet (aller/retour) passe de l'événement à chaque
inscription : un événement porte désormais les deux sens à la fois, chaque
conducteur/passager choisit pour lequel il s'inscrit (éventuellement les
deux, auquel cas deux lignes — même nom/adresse, un sens chacune).

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-02

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Réutilise le type "direction" déjà créé par 0001 — create_type=False,
# même raison que dans 0001 : évite le CREATE TYPE en double déclenché par
# add_column.
direction_enum = postgresql.ENUM("ramassage", "dispersion", name="direction", create_type=False)


def upgrade() -> None:
    # Nullable d'abord : les lignes existantes n'ont pas encore de valeur —
    # elle arrive juste après par backfill, avant de verrouiller en NOT NULL.
    op.add_column("drivers", sa.Column("direction", direction_enum, nullable=True))
    op.add_column("passengers", sa.Column("direction", direction_enum, nullable=True))
    op.add_column("solutions", sa.Column("direction", direction_enum, nullable=True))

    # Backfill depuis le sens de l'événement d'origine — préserve les
    # inscriptions déjà faites plutôt que de les laisser sans sens.
    op.execute(
        "UPDATE drivers SET direction = events.direction "
        "FROM events WHERE drivers.event_id = events.id"
    )
    op.execute(
        "UPDATE passengers SET direction = events.direction "
        "FROM events WHERE passengers.event_id = events.id"
    )
    op.execute(
        "UPDATE solutions SET direction = events.direction "
        "FROM events WHERE solutions.event_id = events.id"
    )

    op.alter_column("drivers", "direction", nullable=False)
    op.alter_column("passengers", "direction", nullable=False)
    op.alter_column("solutions", "direction", nullable=False)

    op.drop_column("events", "direction")


def downgrade() -> None:
    op.add_column("events", sa.Column("direction", direction_enum, nullable=True))
    # Best effort : reprend le sens du premier conducteur/passager trouvé, à
    # défaut "dispersion" — une reconstruction exacte n'est pas possible une
    # fois les deux sens mélangés sous un même événement.
    op.execute(
        "UPDATE events SET direction = COALESCE("
        "(SELECT direction FROM drivers WHERE drivers.event_id = events.id LIMIT 1),"
        "(SELECT direction FROM passengers WHERE passengers.event_id = events.id LIMIT 1),"
        "'dispersion'::direction)"
    )
    op.alter_column("events", "direction", nullable=False)

    op.drop_column("solutions", "direction")
    op.drop_column("passengers", "direction")
    op.drop_column("drivers", "direction")
