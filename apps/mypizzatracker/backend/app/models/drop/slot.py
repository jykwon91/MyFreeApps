"""Slot model -- a single pickup time within a Drop's service window.

Each Slot has a pickup_time (Time, interpreted on Drop.date) and a max_pizzas
capacity. The (drop_id, pickup_time) pair is unique.
"""
import uuid
from datetime import time as _time

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Slot(Base):
    __tablename__ = "slot"
    __table_args__ = (
        UniqueConstraint("drop_id", "pickup_time", name="uq_slot_drop_pickup_time"),
        CheckConstraint("max_pizzas > 0", name="ck_slot_max_pizzas_positive"),
        Index("ix_slot_drop_id", "drop_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    drop_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pizza_drop.id", ondelete="CASCADE"),
        nullable=False,
    )
    pickup_time: Mapped[_time] = mapped_column(Time, nullable=False)
    max_pizzas: Mapped[int] = mapped_column(Integer, nullable=False)

    drop: Mapped["Drop"] = relationship("Drop", back_populates="slots")


from app.models.drop.drop import Drop  # noqa: E402, F401
