"""Pizza menu -- pizza_type + topping_type tables.

Adds the menu domain: one row per pizza on the menu, one row per topping.
``active`` is the operator's 86'd toggle. ``price`` (pizza) and ``price_delta``
(topping) are Numeric(10, 2) for safe arithmetic.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-14 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------- pizza_type
    op.create_table(
        "pizza_type",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "active", sa.Boolean(), nullable=False, server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("name", name="uq_pizza_type_name"),
        sa.CheckConstraint("price >= 0", name="ck_pizza_type_price_nonneg"),
    )
    op.create_index("ix_pizza_type_active", "pizza_type", ["active"])

    # ----------------------------------------------------------- topping_type
    op.create_table(
        "topping_type",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "price_delta", sa.Numeric(10, 2), nullable=False, server_default="0",
        ),
        sa.Column(
            "active", sa.Boolean(), nullable=False, server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("name", name="uq_topping_type_name"),
        sa.CheckConstraint(
            "price_delta >= 0", name="ck_topping_type_price_delta_nonneg",
        ),
    )
    op.create_index("ix_topping_type_active", "topping_type", ["active"])


def downgrade() -> None:
    op.drop_index("ix_topping_type_active", table_name="topping_type")
    op.drop_table("topping_type")
    op.drop_index("ix_pizza_type_active", table_name="pizza_type")
    op.drop_table("pizza_type")
