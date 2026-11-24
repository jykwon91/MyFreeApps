"""A monthly budget for one personal spending category, from a month onward.

A row says "from ``effective_month`` on, this category's monthly budget is
``amount_cents``" until the category's next row. Changing a budget adds (or
updates) the row for the month it was changed in, so the months before it
keep the target they had. ``amount_cents`` NULL means "no budget from this
month on" — removing a budget is a row too, for the same reason.

Scoped to the organization, like the categories it budgets: every member of a
workspace sees the same budget. CASCADE from the category: a category is only
ever archived in the app (which keeps its budgets), so a hard delete only
happens with the whole workspace.

``effective_month`` is always the first of a month; PostgreSQL enforces it
(``chk_spending_budget_month_start``). The check is PostgreSQL-only because
SQLite, which the tests run on, has no ``date_trunc``; the service normalises
every month before writing.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SpendingBudget(Base):
    __tablename__ = "spending_budgets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    spending_category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("spending_categories.id", ondelete="CASCADE"),
        nullable=False,
    )
    effective_month: Mapped[_dt.date] = mapped_column(Date, nullable=False)
    amount_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        onupdate=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        # One budget per category per starting month. Its leading column also
        # serves "this category's rows up to a month" lookups.
        UniqueConstraint(
            "spending_category_id", "effective_month", name="uq_spending_budget_category_month",
        ),
        CheckConstraint(
            "amount_cents IS NULL OR amount_cents >= 0",
            name="chk_spending_budget_amount_non_negative",
        ),
        CheckConstraint(
            "effective_month = CAST(date_trunc('month', effective_month) AS DATE)",
            name="chk_spending_budget_month_start",
        ).ddl_if(dialect="postgresql"),
    )
