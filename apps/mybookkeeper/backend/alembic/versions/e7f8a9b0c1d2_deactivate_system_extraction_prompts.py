"""deactivate_system_extraction_prompts

Code is now the source of truth for the base extraction prompt.
Deactivate all system-level (user_id IS NULL) extraction prompts
so they no longer override the code-defined DEFAULT_PROMPT.

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-03-19 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text("UPDATE extraction_prompts SET is_active = false WHERE user_id IS NULL")
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE extraction_prompts SET is_active = true "
            "WHERE user_id IS NULL AND name = 'default'"
        )
    )
