"""Record when a property started collecting rent.

``properties.rented_since`` is the day a home began being rented, kept apart
from ``date_placed_in_service`` because that one drives depreciation and a
home rented out part-time is not necessarily placed in service. Rental ROI
counts only the months from it on, so the costs of living in a home before it
was rented don't inflate what it needs to earn.

Existing properties stay NULL: nothing records when renting began.

Revision ID: rentedsince261119
Revises: zipbatchhash261117
Create Date: 2026-11-19 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "rentedsince261119"
down_revision: str | None = "zipbatchhash261117"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column("properties", sa.Column("rented_since", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("properties", "rented_since")
