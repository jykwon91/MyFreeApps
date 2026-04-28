"""SQLAlchemy ORM model for ``applicant_references``.

Per RENTALS_PLAN.md §5.3: contact references the applicant supplies (former
landlords, employers, personal references). The host calls / emails them
out-of-band and records the outcome in ``notes``.

Table-name choice: SQL ``REFERENCES`` is a reserved keyword in many dialects
(it's the FK declaration keyword). PostgreSQL would auto-quote a table named
``references`` but Alembic's autogenerate, query logs, and external tooling
(pgAdmin, dump/restore) all become harder to read. ``applicant_references``
is unambiguous and parallels the inquiries → inquiry_messages naming.

PII columns: ``reference_name`` and ``reference_contact`` are encrypted via
``EncryptedString``. Naming uses the ``reference_*`` prefix (mirroring the
``inquirer_*`` convention) so the audit-log SENSITIVE_FIELDS allowlist can
mask them precisely without colliding with bare ``name``/``contact``
columns elsewhere in the schema (Property, Organization, User all have
plain ``name`` columns we DON'T want to mask).
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.applicant_enums import REFERENCE_RELATIONSHIPS_SQL
from app.core.encrypted_string_type import EncryptedString
from app.db.base import Base


class Reference(Base):
    __tablename__ = "applicant_references"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applicants.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    relationship: Mapped[str] = mapped_column(String(40), nullable=False)
    # PII — encrypted at rest via EncryptedString TypeDecorator.
    reference_name: Mapped[str] = mapped_column(
        EncryptedString(255), nullable=False,
    )
    # ``reference_contact`` is freeform — email or phone, sometimes both.
    reference_contact: Mapped[str] = mapped_column(
        EncryptedString(255), nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    contacted_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
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
        CheckConstraint(
            f"relationship IN {REFERENCE_RELATIONSHIPS_SQL}",
            name="chk_applicant_reference_relationship",
        ),
        # Note: the FK ``applicant_id`` already gets ``ix_applicant_references_applicant_id``
        # from the column-level ``index=True`` — no additional composite index
        # needed here (lookups are always "list references for this applicant").
    )
