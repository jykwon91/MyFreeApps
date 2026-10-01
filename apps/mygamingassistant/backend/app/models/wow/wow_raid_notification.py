"""WowRaidNotification — outbox for scheduled bot messages.

event_id FK → wow_raid_event (ON DELETE CASCADE).

Uniqueness for NULL target_user_id (channel posts) requires a partial index
because standard UNIQUE constraints treat NULL as distinct (every NULL would
be unique, allowing duplicates).  Two partial indexes cover the two cases:

  uq_wowraidnotif_channel_post:
      UNIQUE(event_id, kind, due_at) WHERE target_user_id IS NULL
      Prevents scheduling the same channel-post twice at the same time.

  uq_wowraidnotif_user_notif:
      UNIQUE(event_id, kind, target_user_id, due_at) WHERE target_user_id IS NOT NULL
      Prevents scheduling the same DM-to-user twice.

INSERT ... ON CONFLICT DO NOTHING (no target clause) catches conflicts on
either partial index — safe to call from schedule_for_event idempotently.

Workers claim due rows with SELECT ... FOR UPDATE SKIP LOCKED, set claimed_at,
then call mark_sent or mark_failed.  Rows with attempts >= MAX_ATTEMPTS are
excluded from future claims (give-up semantics without extra columns).
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

NOTIFICATION_KINDS = (
    "signup_nudge",
    "consumables_reminder",
    "ready_check",
    "raid_cancelled",
)

MAX_ATTEMPTS = 5


class WowRaidNotification(Base):
    __tablename__ = "wow_raid_notification"
    __table_args__ = (
        CheckConstraint(
            f"kind IN {NOTIFICATION_KINDS!r}",
            name="ck_wowraidnotif_kind",
        ),
        # Partial unique index — channel posts (target_user_id IS NULL).
        Index(
            "uq_wowraidnotif_channel_post",
            "event_id",
            "kind",
            "due_at",
            unique=True,
            postgresql_where=text("target_user_id IS NULL"),
        ),
        # Partial unique index — per-user DMs (target_user_id IS NOT NULL).
        Index(
            "uq_wowraidnotif_user_notif",
            "event_id",
            "kind",
            "target_user_id",
            "due_at",
            unique=True,
            postgresql_where=text("target_user_id IS NOT NULL"),
        ),
        # Covering index for claim_due: scan only pending rows, skip sent.
        Index(
            "ix_wowraidnotif_due_pending",
            "due_at",
            postgresql_where=text("sent_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wow_raid_event.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    # null = channel post; non-null = DM to this Discord user ID.
    target_user_id: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True
    )
    due_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Set by claim_due; cleared when mark_sent/mark_failed runs.
    claimed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
