import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.welcome_manual_constants import (
    PLACE_CUISINE_MAX_LEN,
    PLACE_MAP_URL_MAX_LEN,
    PLACE_NAME_MAX_LEN,
    PLACE_NOTE_MAX_LEN,
    WELCOME_MANUAL_PRICE_TIERS,
)
from app.db.base import Base

_PRICE_TIER_CHECK_SQL = (
    "price_tier IN (" + ", ".join(f"'{t}'" for t in WELCOME_MANUAL_PRICE_TIERS) + ") OR price_tier IS NULL"
)


class WelcomeManualPlace(Base):
    """A restaurant recommendation ("place") attached directly to a welcome
    manual (a guest dining directory) — no section parent, unlike sections'
    label/value fields. Cascade-deleted with the manual. Ordered within the
    manual by ``display_order``.

    DEFERRED — do NOT build these now:
    - Per-place food photos: a future ``welcome_manual_place_images`` child
      table, mirroring ``welcome_manual_section_image.py``.
    - "Must-have dishes": a future additive column or child table on this
      model.
    """

    __tablename__ = "welcome_manual_places"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    manual_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("welcome_manuals.id", ondelete="CASCADE"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(PLACE_NAME_MAX_LEN), nullable=False)
    cuisine: Mapped[str] = mapped_column(String(PLACE_CUISINE_MAX_LEN), nullable=False)
    price_tier: Mapped[str | None] = mapped_column(String(4), nullable=True)
    note: Mapped[str | None] = mapped_column(String(PLACE_NOTE_MAX_LEN), nullable=True)
    map_url: Mapped[str | None] = mapped_column(String(PLACE_MAP_URL_MAX_LEN), nullable=True)
    display_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(_PRICE_TIER_CHECK_SQL, name="ck_welcome_manual_places_price_tier"),
        Index("ix_welcome_manual_places_manual_order", "manual_id", "display_order"),
    )
