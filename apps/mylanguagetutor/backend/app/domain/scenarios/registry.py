"""Registry of conversation scenarios, in learning-path order.

Goals are language-agnostic English: they name the communicative function
("ask the price"), not target-language phrases. The Spanish model phrases
(``¿Puede repetir?``, ``Soy de…``, ``Me da…, por favor``, ``¿Dónde está…?``,
``Me gusta…``) belong to the per-language prompt fragments added in PR 4.

Adding a scenario is a code change PLUS an Alembic migration that widens the
``ck_tutor_session_scenario_slug`` CHECK constraint --
``tests/test_domain_registries.py`` fails until both agree.
"""
from __future__ import annotations

from app.domain.scenarios.scenario import Scenario

FREE_TALK_SLUG = "free-talk"

_SCENARIO_LIST: tuple[Scenario, ...] = (
    Scenario(
        slug="greetings",
        title="Greetings",
        goal="Say hello and exchange names.",
        goals=(
            "Greet the tutor.",
            "Give your name.",
            "Ask the tutor's name.",
        ),
        order=1,
    ),
    Scenario(
        slug="repair-phrases",
        title="Asking for help",
        goal="Keep the conversation going when you don't understand.",
        goals=(
            "Use at least two of: ask the tutor to repeat, ask them to speak "
            "more slowly, say you don't understand.",
        ),
        order=2,
    ),
    Scenario(
        slug="about-me",
        title="About me",
        goal="Say where you're from and share something about yourself.",
        goals=(
            "Say where you're from.",
            "Share one fact about yourself.",
            "Ask the tutor one question back.",
        ),
        order=3,
    ),
    Scenario(
        slug="cafe",
        title="At the café",
        goal="Order something to eat or drink.",
        goals=(
            "Order politely (\"I'd like…\" / \"Could I have…, please\").",
            "Ask how much it costs.",
        ),
        order=4,
    ),
    Scenario(
        slug="paying",
        title="Paying",
        goal="Understand a price when you hear it.",
        goals=(
            "Understand a spoken price.",
            "Say the price back to confirm it.",
        ),
        order=5,
    ),
    Scenario(
        slug="directions",
        title="Directions",
        goal="Ask where something is and follow the answer.",
        goals=(
            "Ask where a place is.",
            "Repeat back one direction you were given.",
        ),
        order=6,
    ),
    Scenario(
        slug="likes-weekend",
        title="Likes and the weekend",
        goal="Talk about what you like to do.",
        goals=(
            "Say something you like and give a reason.",
            "Ask the tutor a question.",
        ),
        order=7,
    ),
    Scenario(
        slug="appointment",
        title="Making an appointment",
        goal="Set a day and time and confirm the details.",
        goals=(
            "Give a day and a time.",
            "Confirm one detail of the appointment.",
        ),
        order=8,
    ),
    Scenario(
        slug=FREE_TALK_SLUG,
        title="Free talk",
        goal="Chat about anything you like, at your own pace.",
        goals=(),
        order=9,
    ),
)

SCENARIOS: dict[str, Scenario] = {s.slug: s for s in _SCENARIO_LIST}

SCENARIO_SLUGS: tuple[str, ...] = tuple(SCENARIOS)


def get_scenario(slug: str) -> Scenario | None:
    """Return the scenario for ``slug``, or None when unknown."""
    return SCENARIOS.get(slug)


def list_scenarios() -> list[Scenario]:
    """All scenarios, ordered by ``order``."""
    return sorted(SCENARIOS.values(), key=lambda s: s.order)
