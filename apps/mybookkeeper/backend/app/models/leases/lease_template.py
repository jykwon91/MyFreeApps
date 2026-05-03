"""Reusable lease document templates with bracketed placeholders.

A ``LeaseTemplate`` is a named bundle (1+ files) that the host uploads once
and re-uses to generate filled-in leases per applicant. Brackets like
``[TENANT FULL NAME]`` are detected at upload time and stored in
``LeaseTemplatePlaceholder`` rows for the host to refine before generation.

Soft-deleted because templates may be referenced by historical
``signed_leases`` rows that must remain auditable.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LeaseTemplate(Base):
    __tablename__ = "lease_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Bumped by re-upload; surfaced in the UI so hosts know which template
    # version a given signed lease was generated from.
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1",
    )

    # Soft-delete: blocked when active signed leases reference this template.
    deleted_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
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
        Index(
            "ix_lease_templates_org_active",
            "organization_id", "created_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
