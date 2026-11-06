"""WowFeatureVote — one browser's "me too" on a feature story.

Anonymous: never a raw IP or the browser's client UUID. ``voter_key`` is an
HMAC of the client UUID (keyed from SECRET_KEY with a domain label — see
``feature_hashing``); one row per (story, voter) is the dedupe. ``ip_hash`` is
an HMAC of the story id + the caller's network (IPv6 cut to /64), used only to
cap votes per network per story, and NULLed after 30 days. Never audited.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.wow_feature_request_enums import VOTE_SOURCES
from app.db.base import Base


class WowFeatureVote(Base):
    __tablename__ = "wow_feature_vote"
    __table_args__ = (
        UniqueConstraint("story_id", "voter_key", name="uq_wowfeaturevote_story_voter"),
        CheckConstraint(f"source IN {VOTE_SOURCES!r}", name="ck_wowfeaturevote_source"),
        CheckConstraint("char_length(voter_key) = 64", name="ck_wowfeaturevote_voter_key_length"),
        Index("ix_wowfeaturevote_voter_key", "voter_key"),
        Index("ix_wowfeaturevote_story_ip", "story_id", "ip_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    story_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wow_feature_story.id", ondelete="CASCADE"),
        nullable=False,
    )
    voter_key: Mapped[str] = mapped_column(String(64), nullable=False)
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
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
