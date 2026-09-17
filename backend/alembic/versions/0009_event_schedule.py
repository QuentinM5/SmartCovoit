"""Optional event schedule; timezone backfill is a separate resumable command."""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("events", sa.Column("arrival_time", sa.Time(), nullable=True))
    op.add_column("events", sa.Column("departure_time", sa.Time(), nullable=True))
    op.add_column("events", sa.Column("departure_next_day", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("events", sa.Column("timezone", sa.String(100), nullable=True))


def downgrade():
    for name in ("timezone", "departure_next_day", "departure_time", "arrival_time"):
        op.drop_column("events", name)
