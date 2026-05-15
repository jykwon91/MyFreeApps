"""Per-drop expenses.

Adds ``pizza_expense`` for manual operator-entered cost lines (vendor,
category, amount, description) tied to a ``pizza_drop``. Phase 2 will
add a receipt_doc_id FK for AI-extracted entries; that's a separate
migration.

FK delete behavior:
- pizza_expense.drop_id  CASCADE  (deleting a drop wipes its expenses;
  drops themselves are RESTRICT-protected via orders, so a drop can only
  be deleted from the planning state with no orders, where the expense
  history is also disposable).

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-15 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pizza_expense",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "drop_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pizza_drop.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("vendor", sa.String(length=100), nullable=False),
        sa.Column("category", sa.String(length=60), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_pizza_expense_drop_id", "pizza_expense", ["drop_id"], unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_pizza_expense_drop_id", table_name="pizza_expense")
    op.drop_table("pizza_expense")
