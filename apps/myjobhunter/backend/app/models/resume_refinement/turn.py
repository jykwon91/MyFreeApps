"""ResumeRefinementTurn — single record in the iterative refinement loop.

Each turn is one AI proposal or one user action. Snapshots the draft
state after the turn so historical replay / undo is possible.

Roles:
- ``ai_critique`` — the initial pass that produces improvement_targets
  for the session. One per session.
- ``ai_proposal`` — Claude proposes a rewrite for the current target.
- ``user_accept`` — user accepts the AI proposal as-is.
- ``user_custom`` — user supplies their own rewrite for the current target.
- ``user_request_alternative`` — user asks Claude for a different proposal
  for the same target.
- ``user_skip`` — user skips the current target without modifying it.
- ``session_complete`` — terminal turn; user marked the session done.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ResumeRefinementTurn(Base):
    __tablename__ = "resume_refinement_turns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_refinement_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    turn_index: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)

    # Description of which section/bullet this turn targets, e.g.
    # "Senior Software Engineer @ Acme — bullet 2".
    target_section: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The AI's proposed rewrite (when role=ai_proposal).
    proposed_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The user's custom rewrite (when role=user_custom).
    user_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The AI's rationale for the proposal (when role=ai_proposal).
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    # If the AI couldn't propose without clarification, the question it
    # asked the user. (Populated instead of proposed_text.)
    clarifying_question: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Snapshot of the resume markdown after this turn. Lets us replay
    # the session and supports a future "undo to this turn" feature.
    draft_after: Mapped[str | None] = mapped_column(Text, nullable=True)

    tokens_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    session: Mapped["ResumeRefinementSession"] = relationship(  # type: ignore[name-defined]
        "ResumeRefinementSession",
        back_populates="turns",
    )

    __table_args__ = (
        CheckConstraint(
            "role IN ("
            "'ai_critique',"
            "'ai_proposal',"
            "'user_accept',"
            "'user_custom',"
            "'user_request_alternative',"
            "'user_skip',"
            "'session_complete'"
            ")",
            name="chk_refinement_turn_role",
        ),
        Index("ix_refinement_turn_session", "session_id", "turn_index"),
    )
