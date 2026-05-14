"""Drop model -- one selling event (a day's service window).

A Drop is the P&L unit. Orders, slots, expenses, and tips all belong to one drop.

Status state machine:
  planning -> active   (open for orders; requires >= 1 slot, enforced in service)
  planning -> closed   (cancel before opening)
  active   -> closed   (service complete; financial state finalized)
  closed   -> *        (terminal)

Table name is ``pizza_drop`` because ``drop`` is a Postgres reserved keyword.
"""
import uuid
from datetime import date as _date, datetime, time as _time, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Index,
    Numeric,
    String,
    Time,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

DROP_STATUSES: tuple[str, ...] = ("planning", "active", "closed")


class Drop(Base):
    __tablename__ = "pizza_drop"
    __table_args__ = (
        CheckConstraint(
            f"status IN {DROP_STATUSES!r}",
            name="ck_pizza_drop_status",
        ),
        CheckConstraint(
            "slot_window_start < slot_window_end",
            name="ck_pizza_drop_window",
        ),
        Index("ix_pizza_drop_date", "date"),
        Index("ix_pizza_drop_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    date: Mapped[_date] = mapped_column(Date, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slot_window_start: Mapped[_time] = mapped_column(Time, nullable=False)
    slot_window_end: Mapped[_time] = mapped_column(Time, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="planning", server_default="planning",
    )
    tip_total: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00"), server_default="0",
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

    slots: Mapped[list["Slot"]] = relationship(
        "Slot",
        back_populates="drop",
        lazy="select",
        cascade="all, delete-orphan",
    )


from app.models.drop.slot import Slot  # noqa: E402, F401
