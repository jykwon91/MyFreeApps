"""Add ``profiles.discovery_defaults`` JSONB column.

Stores per-operator defaults for the New Saved Search dialog so the
operator configures their excluded industries, employment-type
preference, etc. once and has it pre-populated on every new saved
search. Phase B of the discovery filter overhaul.

Shape stored on the column (loose, intentionally — frontend evolves
the keys faster than we want migrations for):

    {
        "excluded_industry_chips": ["government_defense", ...],
        "excluded_keywords": ["lockheed", ...],
        "employment_type": "FULLTIME",
        "experience": "more_than_3_years_experience",
        "country": "us",
        "date_posted": "week",
        "preferred_industries": [...],   // Phase C scoring input
        "preferred_stack": [...],        // Phase C scoring input
        "rejected_stack": [...]          // Phase C scoring input
    }

Reversible: downgrade drops the column.

Revision ID: discdef260507
Revises: disco260507
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "discdef260507"
down_revision: Union[str, None] = "disco260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column(
            "discovery_defaults",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("profiles", "discovery_defaults")
