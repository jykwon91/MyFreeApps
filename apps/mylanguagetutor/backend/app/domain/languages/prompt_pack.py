"""LanguagePromptPack -- the target-language material the tutor prompt uses.

Scenario goals (``app/domain/scenarios``) are language-agnostic English. The
pack adds, per language, the model phrases the tutor should bring into each
scenario plus the language's register and repair conventions. Every scenario
slug must have an entry (``tests/test_prompt_builder.py`` enforces it).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScenarioFragment:
    setting: str
    """One line of role-play framing for the tutor (English)."""
    model_phrases: tuple[str, ...]
    """Target-language chunks the tutor should model and recycle."""


@dataclass(frozen=True)
class LanguagePromptPack:
    code: str
    register_rule: str
    """Formality convention (e.g. tú vs usted)."""
    repair_phrases: tuple[str, ...]
    """What a learner says when lost -- praise these when they are used."""
    didnt_catch_reply: str
    """What the tutor says when the transcript is garbled (blames the tech)."""
    scenarios: dict[str, ScenarioFragment]
