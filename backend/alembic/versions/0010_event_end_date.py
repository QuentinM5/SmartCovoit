"""Date de fin indépendante ; compatibilité avec les anciens clients lendemain."""
import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    # Nullable pour que l'ancien backend continue de créer des événements
    # pendant le déploiement progressif des deux instances.
    op.add_column("events", sa.Column("end_date", sa.Date(), nullable=True))
    op.execute("UPDATE events SET end_date = event_date + CASE WHEN departure_next_day THEN 1 ELSE 0 END")


def downgrade():
    op.drop_column("events", "end_date")
