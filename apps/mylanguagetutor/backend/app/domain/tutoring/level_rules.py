"""How the tutor adapts to each self-reported level.

Numbers come from the language-learning-expert review (2026-09-30). They are
practitioner lore, not research constants -- tune them from measured
words-per-turn once real conversations exist.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.domain.levels import Level


@dataclass(frozen=True)
class LevelRules:
    level: Level
    label: str
    """How the prompt names the learner's level."""
    words_per_sentence: str
    sentences_per_reply: str
    vocabulary: str
    english_policy: str
    tutor_talk_share: str
    max_corrections: int
    """Corrections surfaced per learner turn (the mapper enforces this)."""
    correction_focus: str


LEVEL_RULES: dict[Level, LevelRules] = {
    Level.BEGINNER: LevelRules(
        level=Level.BEGINNER,
        label="complete beginner",
        words_per_sentence="3-7 words",
        sentences_per_reply="1-2 short sentences",
        vocabulary="the ~500 most common words plus the scenario's key words",
        english_policy=(
            "When you use a word the learner has probably not met yet, add a "
            "short English gloss in parentheses right after it, e.g. "
            "\"la cuenta (the bill)\". Parentheses are shown on screen but not "
            "spoken. If the learner is lost, rescue them with one short English "
            "sentence in parentheses, then continue in the target language."
        ),
        tutor_talk_share="about a third of the words in the conversation",
        max_corrections=1,
        correction_focus=(
            "Only errors that block meaning, or errors in a phrase the tutor "
            "just modelled. Ignore everything else."
        ),
    ),
    Level.SOME_PHRASES: LevelRules(
        level=Level.SOME_PHRASES,
        label="learner who knows some phrases",
        words_per_sentence="5-10 words",
        sentences_per_reply="2-3 sentences",
        vocabulary="the ~1,500 most common words plus the scenario's key words",
        english_policy=(
            "Use English only if the learner asks for it or has failed to "
            "understand twice in a row -- then one short English sentence in "
            "parentheses."
        ),
        tutor_talk_share="at most 40% of the words in the conversation",
        max_corrections=2,
        correction_focus="Errors that block meaning first, then noticeable ones.",
    ),
    Level.CONVERSATIONAL: LevelRules(
        level=Level.CONVERSATIONAL,
        label="conversational learner",
        words_per_sentence="up to 15 words",
        sentences_per_reply="2-4 sentences",
        vocabulary="the ~3,000 most common words plus the scenario's key words",
        english_policy="Do not use English at all.",
        tutor_talk_share="at most half of the words in the conversation",
        max_corrections=3,
        correction_focus="Any real error, most important first.",
    ),
}


def rules_for(level: str) -> LevelRules:
    """Rules for a stored level code. Unknown codes fall back to beginner
    (the safest pacing) -- the DB CHECK constraint makes that unreachable."""
    try:
        return LEVEL_RULES[Level(level)]
    except ValueError:
        return LEVEL_RULES[Level.BEGINNER]
