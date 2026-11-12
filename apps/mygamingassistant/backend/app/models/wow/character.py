"""WowCharacter — a WoW Forever character we have looked up, with its last sheet.

Written whenever "Your character" fetches the character from Blizzard
(``character_store_service``). Identity is Blizzard's character id: a rename
moves the row to the new slug and keeps its history, and a name freed and
taken by a new character marks the old row gone and starts a new one. A slug
Blizzard has never answered for is never stored.

``sheet`` is the mapped ``CharacterResponse`` as JSON, a render cache only:
nothing filters or sorts on it (the daily metrics are their own table). A
section Blizzard failed to send keeps its last good value, so a section can be
older than ``fetched_at``. ``sheet_version`` is ``CHARACTER_SHEET_VERSION`` at
write time; a sheet of another version is not read back.

``gone_at`` is set when Blizzard answers 404 for a stored character and cleared
when it answers again. Public game data, so no user FK.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Index, SmallInteger, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, deferred, mapped_column

from app.db.base import Base


class WowCharacter(Base):
    __tablename__ = "wow_character"
    __table_args__ = (
        CheckConstraint("slug = lower(slug)", name="ck_wowcharacter_slug_lower"),
        # One live character per slug; a gone row keeps its slug for its history.
        Index("uq_wowcharacter_slug_live", "slug", unique=True, postgresql_where=text("gone_at IS NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    blizzard_character_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    # "first-surname", lowercased.
    slug: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    surname: Mapped[str] = mapped_column(String(40), nullable=False)
    class_id: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    sheet: Mapped[dict[str, Any]] = deferred(mapped_column(JSONB, nullable=False))
    sheet_version: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # Last time Blizzard sent the character.
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Last time we asked at all, whatever the answer.
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    last_error_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    gone_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
