"""Self-reported learner levels, chosen when a session starts.

Stored as ``tutor_session.level`` (String + CheckConstraint). The tutor uses it
in PR 4 to pace speech and pick vocabulary.
"""
from __future__ import annotations

from enum import StrEnum


class Level(StrEnum):
    BEGINNER = "beginner"
    SOME_PHRASES = "some_phrases"
    CONVERSATIONAL = "conversational"


LEVEL_CODES: tuple[str, ...] = tuple(level.value for level in Level)
