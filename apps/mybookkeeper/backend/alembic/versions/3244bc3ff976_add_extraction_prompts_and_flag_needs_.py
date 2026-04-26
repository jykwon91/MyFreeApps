"""add_extraction_prompts_and_flag_needs_review

Revision ID: 3244bc3ff976
Revises: 69204c8b3da2
Create Date: 2026-03-17 17:00:09.229121

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3244bc3ff976'
down_revision: Union[str, None] = '69204c8b3da2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('extraction_prompts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('prompt_text', sa.Text(), nullable=False),
    sa.Column('mode', sa.String(length=20), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )

    # Seed with default system prompt
    from app.services.extraction.prompts.base_prompt import DEFAULT_PROMPT
    op.execute(
        sa.text(
            "INSERT INTO extraction_prompts (id, user_id, name, prompt_text, mode, is_active, created_at, updated_at) "
            "VALUES (gen_random_uuid(), NULL, 'default', :prompt, 'override', true, now(), now())"
        ).bindparams(prompt=DEFAULT_PROMPT)
    )

    # Retroactively flag pending documents with no useful data
    op.execute(
        sa.text(
            "UPDATE documents SET status = 'needs_review', "
            "description = 'Retroactively flagged: no vendor or amount extracted' "
            "WHERE status = 'pending' AND vendor IS NULL AND amount IS NULL"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("UPDATE documents SET status = 'pending' WHERE status = 'needs_review'"))
    op.drop_table('extraction_prompts')
