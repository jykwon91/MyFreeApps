"""Add interview_details JSONB column to application_events.

When the operator logs an ``interview_scheduled`` or ``interview_completed``
event, they can now supply structured interview metadata — interview type
(phone/video/onsite/panel), scheduled datetime, duration, location/link,
and a list of interviewer names.

This is stored in a dedicated ``interview_details`` JSONB column rather than
reusing ``raw_payload``.  The ``raw_payload`` field is reserved for Gmail-sync
worker payloads and is excluded from all response schemas by CWE-200 audit
(2026-05-02).  Using a purpose-built column keeps the security boundary clean.

The column is nullable so existing rows and non-interview events are unaffected.
No data migration or backfill required.

Revision ID: intrvdt260521
Revises: discmrg260511
Create Date: 2026-05-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "intrvdt260521"
down_revision: Union[str, None] = "discmrg260511"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "application_events",
        sa.Column(
            "interview_details",
            JSONB,
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("application_events", "interview_details")
