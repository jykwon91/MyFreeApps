"""OrderPizzaTopping -- bridge between OrderPizza and ToppingType.

Composite primary key ``(order_pizza_id, topping_type_id)`` -- each topping
appears at most once per pizza line item. Carries a price-delta snapshot so
the operator can later raise a topping's price without rewriting history.

FK delete behavior:
- ``order_pizza_id`` cascades.
- ``topping_type_id`` is RESTRICT (cannot delete a ToppingType that's in
  historical orders -- use the 86'd flag instead).
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class OrderPizzaTopping(Base):
    __tablename__ = "order_pizza_topping"
    __table_args__ = (
        CheckConstraint(
            "price_delta_snapshot >= 0",
            name="ck_order_pizza_topping_price_delta_nonneg",
        ),
    )

    order_pizza_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("order_pizza.id", ondelete="CASCADE"),
        primary_key=True,
    )
    topping_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("topping_type.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    price_delta_snapshot: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    order_pizza: Mapped["OrderPizza"] = relationship(
        "OrderPizza", back_populates="toppings",
    )


from app.models.order.order_pizza import OrderPizza  # noqa: E402, F401
