"""add proposed_property_id to rent_attribution_review_queue

Airbnb payouts have no tenant/applicant — they attribute to a property.
This adds an optional proposed-property suggestion to the review queue so a
host can one-click confirm an Airbnb payout to the right property.

- rent_attribution_review_queue.proposed_property_id — FK properties, SET NULL

Revision ID: rarqprop260517
Revises: trustsndr260514
Create Date: 2026-05-17 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "rarqprop260517"
down_revision: Union[str, None] = "trustsndr260514"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rent_attribution_review_queue",
        sa.Column(
            "proposed_property_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("properties.id", ondelete="SET NULL", name="fk_rarq_property"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("rent_attribution_review_queue", "proposed_property_id")
