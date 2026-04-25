"""add partial unique index for null match_context on classification_rules

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-03-28 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "c3d4e5f6g7h8"
down_revision: Union[str, None] = "b2c3d4e5f6g7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE UNIQUE INDEX uq_rule_no_context "
        "ON classification_rules (organization_id, match_type, match_pattern) "
        "WHERE match_context IS NULL"
    )


def downgrade() -> None:
    op.drop_index("uq_rule_no_context", table_name="classification_rules")
