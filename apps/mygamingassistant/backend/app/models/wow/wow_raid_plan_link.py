"""WowRaidPlanLink — a leader's group-planner link for one raid, migration 0044.

event_id FK → wow_raid_event (ON DELETE CASCADE): links go with their raid.
UNIQUE(event_id, discord_user_id) — one link per leader per raid; its
leading ``event_id`` doubles as the FK's index.  Minting again (Raid: Edit
→ [Groups]) rewrites the row — a new token, ``created_at`` and
``expires_at`` — so the old link stops working.

Only ``token_hash``, the SHA-256 hex of the link's token, is kept.  The
token itself lives in the leader's link (``/raids/<hex>/plan#k=<token>``)
and is never stored or logged (``raid_plan_links``).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WowRaidPlanLink(Base):
    __tablename__ = "wow_raid_plan_link"
    __table_args__ = (
        UniqueConstraint("event_id", "discord_user_id", name="uq_wowraidplanlink_event_user"),
        UniqueConstraint("token_hash", name="uq_wowraidplanlink_token_hash"),
        CheckConstraint("expires_at > created_at", name="ck_wowraidplanlink_expiry"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wow_raid_event.id", ondelete="CASCADE", name="fk_wowraidplanlink_event"),
        nullable=False,
    )
    # The leader it was minted for (a Discord snowflake).
    discord_user_id: Mapped[str] = mapped_column(String(32), nullable=False)
    # sha256(token).hexdigest(): the token is never stored.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    # The link works until then (raid_plan_links.PLAN_LINK_TTL after it was minted).
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
