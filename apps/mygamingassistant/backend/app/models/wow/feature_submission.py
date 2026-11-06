"""WowFeatureSubmission — one anonymous feature request as the visitor typed it.

PRIVATE: never in a public response, never audited (``MGA_SKIP_TABLES``),
never logged. ``raw_text`` is untrusted input — triage reads it only through
``untrusted_*`` fields and treats it as data.

A follow-up to a ``needs_clarification`` verdict is its own row: it copies the
parent's text (the parent is purged after 14 days) and adds the answer.

Retention (``feature_retention_service``): rejected / needs_clarification rows
are deleted after 14 days; a story-linked row's ``raw_text`` and
``clarification_answer`` are NULLed 180 days after triage; ``ip_hash`` is
NULLed after 30 days.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.wow_feature_request_enums import (
    CONTEXT_CLASSES,
    CONTEXT_EXPERIENCES,
    CONTEXT_FACTIONS,
    CONTEXT_LEVEL_BANDS,
    VERDICTS,
)
from app.core.wow_feature_request_limits import (
    CLARIFICATION_ANSWER_MAX,
    MODEL_ID_MAX,
    NUANCE_NOTE_MAX,
    RAW_TEXT_MAX,
    RAW_TEXT_MIN,
    REASON_MAX,
)
from app.db.base import Base


class WowFeatureSubmission(Base):
    __tablename__ = "wow_feature_submission"
    __table_args__ = (
        CheckConstraint(f"verdict IN {VERDICTS!r}", name="ck_wowfeaturesubmission_verdict"),
        CheckConstraint(
            "(verdict IN ('new', 'duplicate')) = (story_id IS NOT NULL)",
            name="ck_wowfeaturesubmission_story_link",
        ),
        CheckConstraint(
            f"raw_text IS NULL OR char_length(raw_text) BETWEEN {RAW_TEXT_MIN} AND {RAW_TEXT_MAX}",
            name="ck_wowfeaturesubmission_raw_text_length",
        ),
        CheckConstraint(
            f"class_id IS NULL OR class_id IN {CONTEXT_CLASSES!r}", name="ck_wowfeaturesubmission_class"
        ),
        CheckConstraint(
            f"experience IS NULL OR experience IN {CONTEXT_EXPERIENCES!r}",
            name="ck_wowfeaturesubmission_experience",
        ),
        CheckConstraint(
            f"level_band IS NULL OR level_band IN {CONTEXT_LEVEL_BANDS!r}",
            name="ck_wowfeaturesubmission_level_band",
        ),
        CheckConstraint(
            f"faction IS NULL OR faction IN {CONTEXT_FACTIONS!r}", name="ck_wowfeaturesubmission_faction"
        ),
        CheckConstraint("jsonb_typeof(professions) = 'array'", name="ck_wowfeaturesubmission_professions"),
        CheckConstraint("jsonb_typeof(activities) = 'array'", name="ck_wowfeaturesubmission_activities"),
        Index(
            "ix_wowfeaturesubmission_inbox",
            "created_at",
            postgresql_where=text("triaged_at IS NULL"),
        ),
        Index("ix_wowfeaturesubmission_verdict_created", "verdict", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    # NULL once purged (retention). Control characters are stripped on the way in.
    raw_text: Mapped[Optional[str]] = mapped_column(String(RAW_TEXT_MAX), nullable=True)
    clarification_answer: Mapped[Optional[str]] = mapped_column(
        String(CLARIFICATION_ANSWER_MAX), nullable=True
    )
    parent_submission_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wow_feature_submission.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # "About you" context — every field optional, allowlisted.
    class_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    experience: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    level_band: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    professions: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    activities: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    faction: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # sha256 of the normalized text — a resubmission reuses the earlier story.
    text_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    verdict: Mapped[str] = mapped_column(String(30), nullable=False)
    story_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("wow_feature_story.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    # What this ask adds to the story it duplicates.
    nuance_note: Mapped[Optional[str]] = mapped_column(String(NUANCE_NOTE_MAX), nullable=True)
    # The clarifying question, or why it was rejected.
    reason: Mapped[Optional[str]] = mapped_column(String(REASON_MAX), nullable=True)
    # NULL when the story was reused without a Claude call.
    model_id: Mapped[Optional[str]] = mapped_column(String(MODEL_ID_MAX), nullable=True)
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    triaged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
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
