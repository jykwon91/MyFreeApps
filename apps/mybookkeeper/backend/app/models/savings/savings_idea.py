"""A researched way for a person to spend less, kept across daily runs.

``idea_key`` is derived from the idea's category and the thing it is about
(``credit_card:chase-sapphire-preferred``), never chosen by the model, so the
same idea found again the next day updates this row (``last_confirmed_at``
and the latest figures) instead of adding a second one. Unique per person.

``status`` is the person's call: ``done`` and ``dismissed`` stay that way when
a later run finds the idea again. An ``open`` idea leaves the page when no run
has re-confirmed it for ``IDEA_STALE_DAYS`` or its offer has expired; the row
stays, so finding it again brings it back with its history.

``steps`` and ``source_urls`` are JSON lists of strings; every URL came back
in that run's own search or fetch results. ``card_details`` is set only for a
credit card idea (minimum spend, annual fee, first-year value, credit impact).
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.savings_constants import (
    IDEA_KEY_MAX_LENGTH,
    IDEA_SUBJECT_MAX_LENGTH,
    IDEA_TITLE_MAX_LENGTH,
)
from app.core.savings_enums import (
    IDEA_CATEGORIES_SQL,
    IDEA_EFFORTS_SQL,
    IDEA_STATUS_OPEN,
    IDEA_STATUSES_SQL,
)
from app.db.base import Base


class SavingsIdea(Base):
    __tablename__ = "savings_ideas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False,
    )
    # The run that last found it. SET NULL: run history can be pruned without
    # losing the idea.
    last_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("savings_research_runs.id", ondelete="SET NULL"), index=True, nullable=True,
    )
    idea_key: Mapped[str] = mapped_column(String(IDEA_KEY_MAX_LENGTH), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    subject: Mapped[str] = mapped_column(String(IDEA_SUBJECT_MAX_LENGTH), nullable=False)
    title: Mapped[str] = mapped_column(String(IDEA_TITLE_MAX_LENGTH), nullable=False)
    savings_low_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    savings_high_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    effort: Mapped[str] = mapped_column(String(10), nullable=False)
    why_it_fits: Mapped[str] = mapped_column(Text, nullable=False)
    steps: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    source_urls: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    card_details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    expires_on: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default=IDEA_STATUS_OPEN, server_default=IDEA_STATUS_OPEN,
    )
    status_changed_at: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_found_at: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_confirmed_at: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        onupdate=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", "idea_key", name="uq_savings_ideas_org_user_key"),
        CheckConstraint(f"category IN {IDEA_CATEGORIES_SQL}", name="chk_savings_idea_category"),
        CheckConstraint(f"effort IN {IDEA_EFFORTS_SQL}", name="chk_savings_idea_effort"),
        CheckConstraint(f"status IN {IDEA_STATUSES_SQL}", name="chk_savings_idea_status"),
        CheckConstraint(
            "savings_low_cents >= 0 AND savings_high_cents >= savings_low_cents",
            name="chk_savings_idea_savings_range",
        ),
        # The page lists one person's ideas by status, biggest saving first.
        Index("ix_savings_ideas_org_user_status", "organization_id", "user_id", "status"),
    )
