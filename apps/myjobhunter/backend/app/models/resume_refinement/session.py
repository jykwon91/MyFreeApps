"""ResumeRefinementSession — live working document for the resume-refinement loop.

A session ties a user to a source resume upload and tracks the
markdown draft, the prioritized improvement targets, the pending AI
proposal, and per-session token / cost counters.

Status values: ``active`` (default), ``completed`` (user marked done),
``abandoned`` (user explicitly walked away or auto-aged out).
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ResumeRefinementSession(Base):
    __tablename__ = "resume_refinement_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Optional FK to the resume the user originally uploaded. Nullable so
    # the session survives the upload row being deleted; the session
    # still has its own ``current_draft`` to operate on.
    source_resume_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_upload_jobs.id", ondelete="SET NULL"),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)

    # The live working markdown document. Updated whenever a user accepts
    # an AI proposal or supplies a custom rewrite for the current target.
    current_draft: Mapped[str] = mapped_column(Text, default="", nullable=False)

    # Output of the initial critique pass: ordered list of
    # {section, current_text, improvement_type, severity} dicts.
    improvement_targets: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Pointer into ``improvement_targets`` — increments after each turn
    # the user accepts / overrides / skips.
    target_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Pending AI proposal state. Populated when ``advance_session`` emits
    # a proposal and cleared when the user accepts / overrides / skips.
    pending_target_section: Mapped[str | None] = mapped_column(Text, nullable=True)
    pending_proposal: Mapped[str | None] = mapped_column(Text, nullable=True)
    pending_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    pending_clarifying_question: Mapped[str | None] = mapped_column(Text, nullable=True)

    turn_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_cost_usd: Mapped[Decimal] = mapped_column(
        Numeric(10, 6), default=Decimal("0"), nullable=False,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    turns: Mapped[list["ResumeRefinementTurn"]] = relationship(  # type: ignore[name-defined]
        "ResumeRefinementTurn",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ResumeRefinementTurn.turn_index",
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('active','completed','abandoned')",
            name="chk_refinement_session_status",
        ),
        Index("ix_refinement_session_user_status", "user_id", "status"),
    )
