"""Prompt builder -- pure functions, no DB, no Claude.

Pins the contract the tutor depends on: per-level rules reach both system
prompts, the reply system prompt is session-stable (so it caches), the cache
breakpoints sit where the module docstring says, and the corrections call
asks for schema-constrained JSON.
"""
from __future__ import annotations

import pytest

from app.domain.languages import get_language, get_prompt_pack
from app.domain.levels import Level
from app.domain.scenarios import SCENARIO_SLUGS, get_scenario
from app.domain.tutoring.level_rules import LEVEL_RULES, rules_for
from app.services.tutor.prompt_builder import (
    CORRECTIONS_CONTEXT_TURNS,
    CORRECTIONS_SCHEMA,
    RETRY_PROMPT_MIN_GAP_TURNS,
    HistoryTurn,
    SessionPromptContext,
    TurnPromptContext,
    build_corrections_request,
    build_corrections_system,
    build_reply_request,
    build_reply_system,
    build_translation_request,
)


def _session(level: Level = Level.BEGINNER, scenario: str = "cafe") -> SessionPromptContext:
    language = get_language("es")
    pack = get_prompt_pack("es")
    found = get_scenario(scenario)
    assert language is not None and pack is not None and found is not None
    return SessionPromptContext(language=language, pack=pack, scenario=found, rules=rules_for(level))


def _history(n: int) -> tuple[HistoryTurn, ...]:
    return tuple(HistoryTurn(learner_text=f"learner {i}", reply_text=f"tutor {i}") for i in range(n))


class TestLevelRules:
    @pytest.mark.parametrize("level", list(Level))
    def test_reply_system_carries_the_level_rules(self, level: Level) -> None:
        rules = LEVEL_RULES[level]
        system = build_reply_system(_session(level))
        assert rules.label in system
        assert rules.sentences_per_reply in system
        assert rules.words_per_sentence in system
        assert rules.vocabulary in system
        assert rules.english_policy in system

    @pytest.mark.parametrize("level", list(Level))
    def test_corrections_system_carries_the_dosage(self, level: Level) -> None:
        rules = LEVEL_RULES[level]
        system = build_corrections_system(_session(level))
        assert f"At most {rules.max_corrections}" in system
        assert rules.correction_focus in system

    def test_dosage_grows_with_level(self) -> None:
        doses = [LEVEL_RULES[level].max_corrections for level in Level]
        assert doses == [1, 2, 3]

    def test_only_conversational_forbids_english(self) -> None:
        assert "Do not use English" in LEVEL_RULES[Level.CONVERSATIONAL].english_policy
        assert "parentheses" in LEVEL_RULES[Level.BEGINNER].english_policy

    def test_unknown_level_falls_back_to_beginner(self) -> None:
        assert rules_for("nonsense") is LEVEL_RULES[Level.BEGINNER]


class TestSpanishPack:
    def test_every_scenario_has_a_fragment(self) -> None:
        pack = get_prompt_pack("es")
        assert pack is not None
        assert set(pack.scenarios) == set(SCENARIO_SLUGS)

    @pytest.mark.parametrize("slug", SCENARIO_SLUGS)
    def test_scenario_setting_reaches_the_prompt(self, slug: str) -> None:
        pack = get_prompt_pack("es")
        assert pack is not None
        system = build_reply_system(_session(scenario=slug))
        assert pack.scenarios[slug].setting in system

    def test_reply_system_forbids_markdown_and_pronunciation_feedback(self) -> None:
        system = build_reply_system(_session())
        assert "No markdown" in system
        assert "no emoji" in system
        assert "Never comment on pronunciation" in system


class TestReplyRequest:
    def test_system_prompt_is_stable_across_turns(self) -> None:
        session = _session()
        first = build_reply_request(TurnPromptContext(session=session, learner_text="hola"))
        later = build_reply_request(
            TurnPromptContext(
                session=session,
                learner_text="quiero un café",
                history=_history(3),
                goals_met=(0,),
                turn_number=4,
            )
        )
        assert first.system == later.system
        assert first.system[0]["cache_control"] == {"type": "ephemeral"}

    def test_first_turn_has_no_history_breakpoint(self) -> None:
        request = build_reply_request(TurnPromptContext(session=_session(), learner_text="hola"))
        assert len(request.messages) == 1
        final = request.messages[0]
        assert final["role"] == "user"
        assert all("cache_control" not in block for block in final["content"])

    def test_history_breakpoint_on_last_history_message_only(self) -> None:
        request = build_reply_request(
            TurnPromptContext(session=_session(), learner_text="hola", history=_history(3))
        )
        # 3 exchanges -> 6 history messages + the new turn.
        assert len(request.messages) == 7
        roles = [m["role"] for m in request.messages]
        assert roles == ["user", "assistant"] * 3 + ["user"]
        breakpoints = [
            i
            for i, m in enumerate(request.messages)
            if isinstance(m["content"], list)
            and any("cache_control" in block for block in m["content"])
        ]
        assert breakpoints == [5]
        assert request.messages[5]["content"][0]["text"] == "tutor 2"

    def test_final_message_is_note_then_learner_text(self) -> None:
        request = build_reply_request(
            TurnPromptContext(
                session=_session(),
                learner_text="quiero un café",
                goals_met=(0,),
                turn_number=2,
                max_turns=40,
            )
        )
        note, learner = request.messages[-1]["content"]
        assert note["text"].startswith("[Session note")
        assert "turn 2 of 40" in note["text"]
        assert "goals met so far: [0]" in note["text"]
        assert learner["text"] == "quiero un café"

    def test_free_talk_note_has_no_goals(self) -> None:
        request = build_reply_request(
            TurnPromptContext(session=_session(scenario="free-talk"), learner_text="hola")
        )
        assert "free conversation" in request.messages[-1]["content"][0]["text"]

    def test_prompt_chars_counts_every_part(self) -> None:
        request = build_reply_request(TurnPromptContext(session=_session(), learner_text="hola"))
        assert request.prompt_chars() > len(request.system[0]["text"])


class TestCorrectionsRequest:
    def test_asks_for_schema_constrained_json(self) -> None:
        request = build_corrections_request(TurnPromptContext(session=_session(), learner_text="hola"))
        fmt = request.extra["output_config"]["format"]
        assert fmt["type"] == "json_schema"
        assert fmt["schema"] is CORRECTIONS_SCHEMA
        # Nullable fields must use anyOf -- a bare "type": ["string", "null"]
        # list is rejected by structured outputs.
        assert CORRECTIONS_SCHEMA["properties"]["retry_prompt"] == {
            "anyOf": [{"type": "string"}, {"type": "null"}]
        }

    def test_learner_turn_is_last_and_context_is_bounded(self) -> None:
        request = build_corrections_request(
            TurnPromptContext(session=_session(), learner_text="un cafe", history=_history(10))
        )
        note, learner = request.messages[0]["content"]
        assert learner["text"] == "un cafe"
        shown = [i for i in range(10) if f"learner {i}\n" in note["text"]]
        assert shown == list(range(10 - CORRECTIONS_CONTEXT_TURNS, 10))

    @pytest.mark.parametrize(
        ("since_retry", "allowed"),
        [
            (None, "yes"),
            (RETRY_PROMPT_MIN_GAP_TURNS - 1, "no"),
            (RETRY_PROMPT_MIN_GAP_TURNS, "yes"),
        ],
    )
    def test_retry_prompt_spacing(self, since_retry: int | None, allowed: str) -> None:
        request = build_corrections_request(
            TurnPromptContext(
                session=_session(), learner_text="x", turns_since_retry_prompt=since_retry,
            )
        )
        assert f"Retry prompt allowed this turn: {allowed}." in request.messages[0]["content"][0]["text"]


def test_translation_request_is_plain() -> None:
    language = get_language("es")
    assert language is not None
    request = build_translation_request(language, "Hola, ¿qué tal?")
    assert request.messages == [{"role": "user", "content": "Hola, ¿qué tal?"}]
    assert request.extra == {}
    assert "English" in request.system[0]["text"]
