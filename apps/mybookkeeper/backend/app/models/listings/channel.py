"""Channel reference table (Airbnb / VRBO / Furnished Finder / Rotating Room).

Per RENTALS_PLAN.md PR 1.4 (channels): the ``channels`` table is a small,
operator-managed reference table. Rows are seeded by migration; new channels
can be added with a follow-up data migration without code changes.

The primary key is a string slug (e.g. ``airbnb``) — readable in URLs and
logs, stable across DB rebuilds, and simpler than a UUID for a four-row
reference table.
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Channel(Base):
    __tablename__ = "channels"

    # String slug PK — readable in URLs (`/api/listings/.../channels`),
    # stable across DB rebuilds, idempotent for the seed migration.
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    supports_ical_export: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )
    supports_ical_import: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
