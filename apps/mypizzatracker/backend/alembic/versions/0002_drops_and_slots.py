"""Drops + slots tables.

Adds the pizza_drop and slot tables to support the drop management feature.
Table ``pizza_drop`` is named to avoid the Postgres reserved keyword ``drop``.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-14 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -------------------------------------------------------------- pizza_drop
    op.create_table(
        "pizza_drop",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slot_window_start", sa.Time(), nullable=False),
        sa.Column("slot_window_end", sa.Time(), nullable=False),
        sa.Column(
            "status", sa.String(20), nullable=False, server_default="planning",
        ),
        sa.Column(
            "tip_total", sa.Numeric(10, 2), nullable=False, server_default="0",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "status IN ('planning', 'active', 'closed')",
            name="ck_pizza_drop_status",
        ),
        sa.CheckConstraint(
            "slot_window_start < slot_window_end",
            name="ck_pizza_drop_window",
        ),
    )
    op.create_index("ix_pizza_drop_date", "pizza_drop", ["date"])
    op.create_index("ix_pizza_drop_status", "pizza_drop", ["status"])

    # -------------------------------------------------------------------- slot
    op.create_table(
        "slot",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "drop_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pizza_drop.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("pickup_time", sa.Time(), nullable=False),
        sa.Column("max_pizzas", sa.Integer(), nullable=False),
        sa.UniqueConstraint("drop_id", "pickup_time", name="uq_slot_drop_pickup_time"),
        sa.CheckConstraint("max_pizzas > 0", name="ck_slot_max_pizzas_positive"),
    )
    op.create_index("ix_slot_drop_id", "slot", ["drop_id"])


def downgrade() -> None:
    op.drop_index("ix_slot_drop_id", table_name="slot")
    op.drop_table("slot")
    op.drop_index("ix_pizza_drop_status", table_name="pizza_drop")
    op.drop_index("ix_pizza_drop_date", table_name="pizza_drop")
    op.drop_table("pizza_drop")
