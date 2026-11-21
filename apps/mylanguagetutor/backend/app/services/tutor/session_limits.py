"""The per-session turn cap, asked by the turn that enforces it and by usage that warns of it."""
from __future__ import annotations

from app.core.config import settings
from app.models.tutor.tutor_session import TutorSession


def turn_limit_reached(session: TutorSession) -> bool:
    return session.turn_count >= settings.ltutor_max_turns_per_session
