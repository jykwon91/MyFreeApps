"""Orders, customers, and order line items.

Adds the customer-facing order placement schema:
- ``customer`` -- phone-keyed guest customer record (plaintext, follows
  vendor.py precedent in MBK; encryption is a future tech-debt option).
- ``pizza_order`` -- one row per customer order in a drop slot. Status
  state machine values are defined as a String + CheckConstraint to match
  the rest of the app.
- ``order_pizza`` -- one row per pizza line item under an order, with
  ``price_snapshot`` and ``is_free``.
- ``order_pizza_topping`` -- bridge between order_pizza and topping_type
  with ``price_delta_snapshot``. Composite PK.

FK delete behavior:
- pizza_order.drop_id        RESTRICT  (preserve order history)
- pizza_order.slot_id        RESTRICT
- pizza_order.customer_id    RESTRICT
- order_pizza.order_id       CASCADE   (deleting an order deletes its lines)
- order_pizza.pizza_type_id  RESTRICT  (use 86'd toggle instead of delete)
- order_pizza_topping.order_pizza_id CASCADE
- order_pizza_topping.topping_type_id RESTRICT

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-14 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_ORDER_STATUSES = (
    "not_started",
    "cooking",
    "ready_text_sent",
    "ready_waiting",
    "picked_up",
    "no_show",
)
_PAYMENT_STATUSES = ("unpaid", "paid")


def _status_in_clause(values: tuple[str, ...]) -> str:
    inside = ", ".join(f"'{v}'" for v in values)
    return f"status IN ({inside})"


def _payment_status_in_clause(values: tuple[str, ...]) -> str:
    inside = ", ".join(f"'{v}'" for v in values)
    return f"payment_status IN ({inside})"


def upgrade() -> None:
    # --------------------------------------------------------------- customer
    op.create_table(
        "customer",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("phone", name="uq_customer_phone"),
    )
    op.create_index("ix_customer_phone", "customer", ["phone"])

    # ------------------------------------------------------------ pizza_order
    op.create_table(
        "pizza_order",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "drop_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pizza_drop.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "slot_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("slot.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "customer_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customer.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("payment_method_tag", sa.String(30), nullable=False),
        sa.Column(
            "payment_status", sa.String(20), nullable=False,
            server_default="unpaid",
        ),
        sa.Column(
            "status", sa.String(30), nullable=False,
            server_default="not_started",
        ),
        sa.Column("ready_text_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            _status_in_clause(_ORDER_STATUSES),
            name="ck_pizza_order_status",
        ),
        sa.CheckConstraint(
            _payment_status_in_clause(_PAYMENT_STATUSES),
            name="ck_pizza_order_payment_status",
        ),
    )
    op.create_index("ix_pizza_order_drop_id", "pizza_order", ["drop_id"])
    op.create_index("ix_pizza_order_slot_id", "pizza_order", ["slot_id"])
    op.create_index("ix_pizza_order_customer_id", "pizza_order", ["customer_id"])
    op.create_index("ix_pizza_order_status", "pizza_order", ["status"])

    # ------------------------------------------------------------- order_pizza
    op.create_table(
        "order_pizza",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "order_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pizza_order.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "pizza_type_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pizza_type.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("modifications_text", sa.Text(), nullable=True),
        sa.Column(
            "is_free", sa.Boolean(), nullable=False, server_default=sa.text("false"),
        ),
        sa.Column("price_snapshot", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("price_snapshot >= 0", name="ck_order_pizza_price_nonneg"),
    )
    op.create_index("ix_order_pizza_order_id", "order_pizza", ["order_id"])
    op.create_index("ix_order_pizza_pizza_type_id", "order_pizza", ["pizza_type_id"])

    # ----------------------------------------------------- order_pizza_topping
    op.create_table(
        "order_pizza_topping",
        sa.Column(
            "order_pizza_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("order_pizza.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "topping_type_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("topping_type.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("price_delta_snapshot", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "price_delta_snapshot >= 0",
            name="ck_order_pizza_topping_price_delta_nonneg",
        ),
    )


def downgrade() -> None:
    op.drop_table("order_pizza_topping")
    op.drop_index("ix_order_pizza_pizza_type_id", table_name="order_pizza")
    op.drop_index("ix_order_pizza_order_id", table_name="order_pizza")
    op.drop_table("order_pizza")
    op.drop_index("ix_pizza_order_status", table_name="pizza_order")
    op.drop_index("ix_pizza_order_customer_id", table_name="pizza_order")
    op.drop_index("ix_pizza_order_slot_id", table_name="pizza_order")
    op.drop_index("ix_pizza_order_drop_id", table_name="pizza_order")
    op.drop_table("pizza_order")
    op.drop_index("ix_customer_phone", table_name="customer")
    op.drop_table("customer")
