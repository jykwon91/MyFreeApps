"""Where a refinement session stood when a Claude call began."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.models.resume_refinement.session import ResumeRefinementSession


@dataclass(frozen=True)
class SessionPosition:
    status: str
    target_index: int
    turn_count: int
    # Changes when a preparation is claimed again, so a result from a run
    # that lost its claim is told apart from the run that now holds it.
    preparation_started_at: datetime | None

    @classmethod
    def of(cls, session: ResumeRefinementSession) -> SessionPosition:
        return cls(
            status=session.status,
            target_index=session.target_index,
            turn_count=session.turn_count,
            preparation_started_at=session.preparation_started_at,
        )
