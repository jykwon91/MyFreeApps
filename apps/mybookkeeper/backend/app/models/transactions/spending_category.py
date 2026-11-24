"""A user-defined personal spending category.

Scoped to the organization (all workspace members see the same set), so one
person's "Groceries" budget is consistent whether they look on the web or the
phone.

Default categories (``is_default=True``) are seeded at org creation time and
cannot be archived — they anchor every new user's view.  User-created
categories can be archived (soft-deleted) and can share a name with an
archived one, so recreating a deleted category works without first purging the
old row.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.spending_category_enums import SPENDING_CATEGORY_NAME_MAX_LENGTH
from app.db.base import Base


class SpendingCategory(Base):
    __tablename__ = "spending_categories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(SPENDING_CATEGORY_NAME_MAX_LENGTH), nullable=False,
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    archived_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
    )
    updated_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        onupdate=lambda: _dt.datetime.now(_dt.timezone.utc),
    )

    __table_args__ = (
        # A live (non-archived) name must be unique per org.  Archived
        # categories can share a name with a live one — the user deleted and
        # re-created it.
        Index(
            "uq_spending_category_name_live",
            "organization_id",
            "name",
            unique=True,
            postgresql_where=text("archived_at IS NULL"),
        ),
        # Partial index on live rows — the list page never touches archived.
        Index(
            "ix_spending_category_org_live",
            "organization_id",
            postgresql_where=text("archived_at IS NULL"),
        ),
        CheckConstraint(
            f"length(name) >= 1 AND length(name) <= {SPENDING_CATEGORY_NAME_MAX_LENGTH}",
            name="chk_spending_category_name_length",
        ),
    )
