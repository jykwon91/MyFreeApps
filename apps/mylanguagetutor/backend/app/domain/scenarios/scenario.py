"""Scenario -- one guided conversation a learner can practise."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Scenario:
    """A conversation scenario.

    Text here is language-agnostic English: the goals describe what the learner
    should accomplish. Per-language prompt fragments (the actual target-language
    phrases the tutor models) are layered on in PR 4.

    Attributes:
        slug: Stable id stored on ``tutor_session.scenario_slug``. Never rename.
        title: Learner-facing title.
        goal: One-sentence summary of the scenario.
        goals: Concrete, checkable learner goals, in order. Empty for free talk.
        order: Position in the learning path (1-based). ``free-talk`` sorts last.
    """

    slug: str
    title: str
    goal: str
    goals: tuple[str, ...]
    order: int
