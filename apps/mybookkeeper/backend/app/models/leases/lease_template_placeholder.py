"""Placeholder spec for a lease template.

One row per unique placeholder discovered across the template's files. The
host edits ``display_label``, ``input_type``, ``required``, ``default_source``,
and ``computed_expr`` after the auto-detection runs.

The unique constraint ``(template_id, key)`` ensures a re-upload of the same
template that re-discovers the same placeholders does not insert duplicates;
the service layer preserves the host's edits when the key still matches.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.lease_enums import LEASE_PLACEHOLDER_INPUT_TYPES_SQL
from app.db.base import Base


class LeaseTemplatePlaceholder(Base):
    __tablename__ = "lease_template_placeholders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lease_templates.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Normalised placeholder key — exactly as it appears in brackets but with
    # any internal whitespace collapsed. e.g. ``TENANT FULL NAME`` from
    # ``[TENANT FULL NAME]``. Used in the values JSON of ``signed_leases``.
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    display_label: Mapped[str] = mapped_column(String(200), nullable=False)
    input_type: Mapped[str] = mapped_column(String(20), nullable=False)
    required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true",
    )

    # Optional shortcut for the generate form: pull the default value from a
    # known applicant field. e.g. ``applicant.legal_name``.
    default_source: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Whitelisted DSL — see services/leases/computed.py.
    computed_expr: Mapped[str | None] = mapped_column(Text, nullable=True)

    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

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
        UniqueConstraint(
            "template_id", "key",
            name="uq_lease_template_placeholders_template_id_key",
        ),
        CheckConstraint(
            f"input_type IN {LEASE_PLACEHOLDER_INPUT_TYPES_SQL}",
            name="chk_lease_template_placeholder_input_type",
        ),
    )
