"""Add ``proposal_cache`` JSONB column on resume_refinement_sessions.

Caches generated AI proposals per target_index so navigation between
suggestions doesn't burn an Anthropic round-trip on every move. The
cache is keyed by stringified target_index (because JSON object keys
must be strings):

    {
      "0": {"section": "...", "proposal": "...", "rationale": "...",
            "clarifying_question": null},
      "1": {...}
    }

Cache writes happen in ``_generate_next_proposal``; reads happen in
``navigate``. ``request_alternative`` deliberately bypasses the cache
(and overwrites the entry) so the operator can force a fresh
generation.

Revision ID: propcache260506
Revises: inv260506
Create Date: 2026-05-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "propcache260506"
down_revision: Union[str, None] = "inv260506"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "resume_refinement_sessions",
        sa.Column(
            "proposal_cache",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("resume_refinement_sessions", "proposal_cache")
