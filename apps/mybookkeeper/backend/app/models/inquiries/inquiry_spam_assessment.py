"""SQLAlchemy ORM model for ``inquiry_spam_assessments`` (T0).

Append-only audit of every spam / scam / abuse check ever run on an inquiry.
One row per assessment — the same inquiry may have many rows (one per check
in the 11-step filter pipeline, plus optional ``manual_override`` rows the
operator writes via the inbox).

Per RENTALS_PLAN.md §8.7, ``details_json`` may include the prompt sent to
Claude; the public-form service redacts PII (email + phone) before storing
to keep the audit trail useful without becoming a PII vault.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.inquiry_enums import INQUIRY_SPAM_ASSESSMENT_TYPES_SQL
from app.db.base import Base


class InquirySpamAssessment(Base):
    __tablename__ = "inquiry_spam_assessments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    inquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiries.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Which check produced this row. Constrained by CHECK constraint to the
    # union of pipeline check names + ``manual_override``.
    assessment_type: Mapped[str] = mapped_column(String(40), nullable=False)

    # ``True`` if this check thought the inquiry was OK. ``False`` if the check
    # tripped (honeypot filled, disposable email, score below threshold, etc.).
    # ``NULL`` only when the check itself errored (e.g. Claude API 5xx) — the
    # service treats this as graceful-degradation and lets the inquiry through.
    passed: Mapped[bool | None] = mapped_column(nullable=True)

    # Numeric score 0-100. Only meaningful for ``claude_score`` rows. NULL on
    # all other check types so analytics don't have to filter by type.
    score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    # Red-flag tags returned by Claude or set by the pipeline for non-Claude
    # checks (e.g. ``["honeypot_filled"]``, ``["disposable_email_domain"]``).
    # Stored as a PostgreSQL TEXT[] for fast tag-based queries; JSON-encoded
    # on SQLite via the conftest patch.
    flags: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)

    # Check-specific details. Examples:
    #   turnstile     → {"cf_response": {...}, "ip": "1.2.3.4"}
    #   claude_score  → {"prompt": "...", "raw_response": "..."}  (PII redacted)
    #   rate_limit    → {"ip": "1.2.3.4", "window_seconds": 3600}
    details_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            f"assessment_type IN {INQUIRY_SPAM_ASSESSMENT_TYPES_SQL}",
            name="chk_inquiry_spam_assessment_type",
        ),
        CheckConstraint(
            "score IS NULL OR (score >= 0 AND score <= 100)",
            name="chk_inquiry_spam_assessment_score_range",
        ),
        # Detail-page audit trail — order assessments newest first per inquiry.
        Index(
            "ix_inquiry_spam_assessments_inquiry_created",
            "inquiry_id", "created_at",
        ),
    )
