"""Order model -- one row per customer order within a Drop.

Table is named ``pizza_order`` because ``order`` is a Postgres reserved keyword
(same precedent as ``pizza_drop``).

Status state machine (single forward stream, owner-driven via service dashboard):

    not_started -> cooking -> ready_text_sent -> ready_waiting -> picked_up
                          \\-> ready_waiting (if SMS skipped)
                          (any state) -> no_show  (terminal sad path)

The service layer (PR 7) will own the transition table. PR 5 only creates
orders in ``not_started``.

Payment fields:
- ``payment_method_tag`` is a free-form short string ("venmo", "cash", "zelle",
  "applepay", ...). Operator may extend at will; no enum constraint.
- ``payment_status`` is an enum ("unpaid", "paid"); customer-facing orders
  default to ``unpaid`` (payment happens out-of-band).

``ready_text_sent_at`` records when the Twilio SMS fires (PR 8). NULL until then.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

ORDER_STATUSES: tuple[str, ...] = (
    "not_started",
    "cooking",
    "ready_text_sent",
    "ready_waiting",
    "picked_up",
    "no_show",
)

PAYMENT_STATUSES: tuple[str, ...] = ("unpaid", "paid")


class Order(Base):
    __tablename__ = "pizza_order"
    __table_args__ = (
        CheckConstraint(
            f"status IN {ORDER_STATUSES!r}",
            name="ck_pizza_order_status",
        ),
        CheckConstraint(
            f"payment_status IN {PAYMENT_STATUSES!r}",
            name="ck_pizza_order_payment_status",
        ),
        Index("ix_pizza_order_drop_id", "drop_id"),
        Index("ix_pizza_order_slot_id", "slot_id"),
        Index("ix_pizza_order_customer_id", "customer_id"),
        Index("ix_pizza_order_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    drop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pizza_drop.id", ondelete="RESTRICT"),
        nullable=False,
    )
    slot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("slot.id", ondelete="RESTRICT"),
        nullable=False,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customer.id", ondelete="RESTRICT"),
        nullable=False,
    )
    payment_method_tag: Mapped[str] = mapped_column(String(30), nullable=False)
    payment_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unpaid", server_default="unpaid",
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="not_started", server_default="not_started",
    )
    ready_text_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    pizzas: Mapped[list["OrderPizza"]] = relationship(
        "OrderPizza",
        back_populates="order",
        lazy="select",
        cascade="all, delete-orphan",
    )


from app.models.order.order_pizza import OrderPizza  # noqa: E402, F401
