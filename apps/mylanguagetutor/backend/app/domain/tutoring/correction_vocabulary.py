"""The closed vocabularies a correction is described with.

Used three ways: the corrections JSON schema (``enum``), the response mapper
(drops anything outside these), and the frontend union types in
``frontend/src/types/tutor/correction.ts`` -- change them together.
"""
from __future__ import annotations

from enum import StrEnum


class ErrorType(StrEnum):
    LEXICAL = "lexical"
    VERB_FORM = "verb_form"
    AGREEMENT = "agreement"
    GENDER = "gender"
    WORD_ORDER = "word_order"
    MISSING_WORD = "missing_word"
    ENGLISH_INSERTION = "english_insertion"


class Severity(StrEnum):
    """Ordered most -> least important (the mapper keeps the top N)."""

    BLOCKS_MEANING = "blocks_meaning"
    NOTICEABLE = "noticeable"
    MINOR = "minor"


class FeedbackMove(StrEnum):
    RECAST = "recast"
    ELICITATION = "elicitation"
    CLARIFICATION = "clarification"
    EXPLICIT = "explicit"


ERROR_TYPES: tuple[str, ...] = tuple(e.value for e in ErrorType)
SEVERITIES: tuple[str, ...] = tuple(s.value for s in Severity)
FEEDBACK_MOVES: tuple[str, ...] = tuple(m.value for m in FeedbackMove)

SEVERITY_RANK: dict[str, int] = {s.value: i for i, s in enumerate(Severity)}
