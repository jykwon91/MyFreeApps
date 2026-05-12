"""Source model — a YouTube playlist/channel or manual upload source.

kind values (String + CheckConstraint, never SQLAlchemy Enum):
  youtube_playlist  — a specific playlist URL
  youtube_channel   — an entire channel (yt-dlp fetches all videos)
  manual            — user-uploaded screenshots (no auto-ingestion)

config_json shape varies by kind:
  youtube_playlist: {"url": "https://youtube.com/playlist?list=..."}
  youtube_channel:  {"channel_url": "https://youtube.com/@..."}
  manual:           {}

Phase 4 wires the actual yt-dlp ingestion; this PR just creates the table.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

_SOURCE_KINDS = ("youtube_playlist", "youtube_channel", "manual")


class Source(Base):
    __tablename__ = "source"
    __table_args__ = (
        CheckConstraint(
            f"kind IN {_SOURCE_KINDS!r}",
            name="ck_source_kind",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    lineups: Mapped[list["Lineup"]] = relationship(
        "Lineup", back_populates="source", lazy="select"
    )


from app.models.game.lineup import Lineup  # noqa: E402, F401
