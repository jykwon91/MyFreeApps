"""Shared AuditLog model.

Append-only, per-field change log written by ``platform_shared.core.audit``'s
SQLAlchemy event listener. Schema is identical to MyBookkeeper's pre-promotion
``audit_logs`` table — no migration is required when an app first picks up the
shared model, only when an app first introduces the table.

Notes:
    * ``user_id``/``changed_by`` is a free-form string, not a FK to ``users`` —
      audit rows must survive user deletion.
    * ``record_id`` is a comma-joined PK string so composite-keyed tables are
      representable without a per-table audit table shape.
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from platform_shared.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    table_name: Mapped[str] = mapped_column(String(100))
    record_id: Mapped[str] = mapped_column(String(255))
    operation: Mapped[str] = mapped_column(String(10))
    field_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_audit_table_record", "table_name", "record_id"),
        Index("ix_audit_changed_at", text("changed_at DESC")),
    )
