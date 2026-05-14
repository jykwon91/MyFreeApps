"""OrderPizza model -- one row per pizza line item within an Order.

An Order has one or more OrderPizza rows; each can carry its own toppings
(via ``OrderPizzaTopping``) and free-form modifications text (e.g., "extra
crispy", "no cheese").

Price snapshots:
- ``price_snapshot`` locks in PizzaType.price at the time the order was
  placed. The operator may later raise the menu price for the same pizza
  without rewriting history.
- ``is_free`` marks comp / VIP / order-error giveaways. When ``is_free`` is
  true, ``price_snapshot`` is still recorded (for audit) but the financials
  view excludes it from revenue (PR 9 wires that).

FK delete behavior:
- ``order_id`` cascades (deleting an order deletes its line items).
- ``pizza_type_id`` is RESTRICT (cannot delete a PizzaType that has historical
  orders -- operator must use the 86'd flag instead). The menu service's
  hard-delete will surface a 409 once that path is exercised in PR 7.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class OrderPizza(Base):
    __tablename__ = "order_pizza"
    __table_args__ = (
        CheckConstraint("price_snapshot >= 0", name="ck_order_pizza_price_nonneg"),
        Index("ix_order_pizza_order_id", "order_id"),
        Index("ix_order_pizza_pizza_type_id", "pizza_type_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pizza_order.id", ondelete="CASCADE"),
        nullable=False,
    )
    pizza_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pizza_type.id", ondelete="RESTRICT"),
        nullable=False,
    )
    modifications_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_free: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )
    price_snapshot: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
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

    order: Mapped["Order"] = relationship("Order", back_populates="pizzas")
    toppings: Mapped[list["OrderPizzaTopping"]] = relationship(
        "OrderPizzaTopping",
        back_populates="order_pizza",
        lazy="select",
        cascade="all, delete-orphan",
    )


from app.models.order.order import Order  # noqa: E402, F401
from app.models.order.order_pizza_topping import OrderPizzaTopping  # noqa: E402, F401
