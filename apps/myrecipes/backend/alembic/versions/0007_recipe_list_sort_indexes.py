"""Index the recipe list sort: public library and per-owner list

Revision ID: 0007
Revises: 0006

Both lists filter ``deleted_at IS NULL`` and page by ``updated_at DESC, id DESC``.
Partial indexes in exactly that order let Postgres read a page straight off the
index instead of sorting every live recipe.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_recipe_live_updated_at_id",
        "recipe",
        [sa.text("updated_at DESC"), sa.text("id DESC")],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_recipe_user_live_updated_at_id",
        "recipe",
        ["user_id", sa.text("updated_at DESC"), sa.text("id DESC")],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_recipe_user_live_updated_at_id", table_name="recipe")
    op.drop_index("ix_recipe_live_updated_at_id", table_name="recipe")
