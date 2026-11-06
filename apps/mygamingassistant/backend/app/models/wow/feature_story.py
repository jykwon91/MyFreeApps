"""WowFeatureStory — one WoW Forever feature request, refined into a user story.

Created by Claude's refinement of an anonymous submission (status
``submitted``, PRIVATE) and curated by triage: approved to ``open``, given a
priority / feasibility / note, merged into another story (``duplicate``,
PRIVATE) or hidden. Only PUBLIC statuses that aren't hidden ever reach a
public read — enforced in ``feature_story_repo``.

``priority`` is private (triage only). ``vote_count`` is denormalized and kept
in step inside the vote transaction; ``feature_story_repo.recount_votes``
recomputes it. Audited (not in ``MGA_SKIP_TABLES``), so every triage write
leaves before/after rows in ``audit_logs``.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, SmallInteger, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.wow_feature_request_enums import (
    FEASIBILITIES,
    PUBLIC_STORY_STATUSES,
    STORY_AREAS,
    STORY_STATUSES,
)
from app.core.wow_feature_request_limits import (
    FEASIBILITY_NOTE_MAX,
    I_WANT_MAX,
    OPERATOR_NOTE_MAX,
    PERSONA_MAX,
    SHIPPED_PATH_MAX,
    SO_THAT_MAX,
    TITLE_MAX,
    TOPIC_MAX,
)
from app.db.base import Base

# Rows the public board can show — the partial indexes cover only these.
PUBLIC_VISIBLE_WHERE = text(f"hidden_at IS NULL AND status IN {PUBLIC_STORY_STATUSES!r}")


class WowFeatureStory(Base):
    __tablename__ = "wow_feature_story"
    __table_args__ = (
        CheckConstraint(f"status IN {STORY_STATUSES!r}", name="ck_wowfeaturestory_status"),
        CheckConstraint(f"area IN {STORY_AREAS!r}", name="ck_wowfeaturestory_area"),
        CheckConstraint(f"feasibility IN {FEASIBILITIES!r}", name="ck_wowfeaturestory_feasibility"),
        CheckConstraint(
            "priority IS NULL OR priority BETWEEN 1 AND 3", name="ck_wowfeaturestory_priority"
        ),
        CheckConstraint(
            "shipped_path IS NULL OR shipped_path ~ '^/wow-forever(/|\\?|$)'",
            name="ck_wowfeaturestory_shipped_path",
        ),
        CheckConstraint(
            "(status = 'duplicate') = (merged_into_id IS NOT NULL)",
            name="ck_wowfeaturestory_merged_status",
        ),
        CheckConstraint("merged_into_id <> id", name="ck_wowfeaturestory_not_self_merged"),
        CheckConstraint("vote_count >= 0", name="ck_wowfeaturestory_vote_count"),
        CheckConstraint(
            "jsonb_typeof(acceptance_criteria) = 'array'", name="ck_wowfeaturestory_criteria_array"
        ),
        CheckConstraint("jsonb_typeof(follow_ups) = 'array'", name="ck_wowfeaturestory_follow_ups_array"),
        Index(
            "ix_wowfeaturestory_public_area_top",
            "area",
            text("vote_count DESC"),
            text("created_at DESC"),
            postgresql_where=PUBLIC_VISIBLE_WHERE,
        ),
        Index(
            "ix_wowfeaturestory_public_area_new",
            "area",
            text("created_at DESC"),
            postgresql_where=PUBLIC_VISIBLE_WHERE,
        ),
        Index(
            "ix_wowfeaturestory_public_top",
            text("vote_count DESC"),
            text("created_at DESC"),
            postgresql_where=PUBLIC_VISIBLE_WHERE,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    title: Mapped[str] = mapped_column(String(TITLE_MAX), nullable=False)
    persona: Mapped[str] = mapped_column(String(PERSONA_MAX), nullable=False)
    i_want: Mapped[str] = mapped_column(String(I_WANT_MAX), nullable=False)
    so_that: Mapped[str] = mapped_column(String(SO_THAT_MAX), nullable=False)
    acceptance_criteria: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    follow_ups: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    area: Mapped[str] = mapped_column(String(30), nullable=False)
    topic: Mapped[Optional[str]] = mapped_column(String(TOPIC_MAX), nullable=True)
    feasibility: Mapped[str] = mapped_column(String(20), nullable=False)
    # Public: shown for not_possible / needs_data.
    feasibility_note: Mapped[Optional[str]] = mapped_column(String(FEASIBILITY_NOTE_MAX), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="submitted", server_default="submitted"
    )
    # PRIVATE — triage only, never in a public response.
    priority: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    # Public: the operator's reply on the board.
    operator_note: Mapped[Optional[str]] = mapped_column(String(OPERATOR_NOTE_MAX), nullable=True)
    shipped_path: Mapped[Optional[str]] = mapped_column(String(SHIPPED_PATH_MAX), nullable=True)
    shipped_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    merged_into_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wow_feature_story.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    vote_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Takedown: a hidden story is never public, whatever its status.
    hidden_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
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
