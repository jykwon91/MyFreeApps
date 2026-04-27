"""SQLAlchemy ORM model for ``reply_templates``.

Per RENTALS_PLAN.md §9.2 — per-user reply templates with variable
substitution. Templates are NOT PII (just instructions for the host's own
outbound messages) so no ``EncryptedString`` columns. Variable substitution
happens at render-time in ``services/inquiries/reply_template_renderer.py`` —
the body stored here is the literal template text with raw ``$variable``
tokens.

Soft-delete via ``is_archived`` rather than ``deleted_at`` — templates are
configuration rather than user data, and archived templates remain queryable
for audit purposes (e.g., "what did the user's library look like in March?").
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReplyTemplate(Base):
    __tablename__ = "reply_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    subject_template: Mapped[str] = mapped_column(String(500), nullable=False)
    body_template: Mapped[str] = mapped_column(Text, nullable=False)

    is_archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )
    display_order: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0",
    )

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
        # Per-user UNIQUE template names — prevents duplicate "Initial reply"
        # entries from accidental re-seeds. Idempotent seeding relies on this.
        UniqueConstraint("user_id", "name", name="uq_reply_template_user_name"),
        # Inbox display index — active templates ordered for the picker.
        Index(
            "ix_reply_templates_org_order_active",
            "organization_id", "display_order",
            postgresql_where=text("is_archived = false"),
        ),
    )
