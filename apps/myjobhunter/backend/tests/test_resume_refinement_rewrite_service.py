"""Tests for the rewrite service — proposal, clarify, and hallucination paths."""
from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.services.resume_refinement import rewrite_service


_FAKE_USER_ID = uuid.uuid4()
_FAKE_SESSION_ID = uuid.uuid4()

_RESUME = """\
# Jane Doe

## Experience

### **Staff Engineer** — Acme Corp
*2020-01 – Present*

- Built distributed payment processing
"""

_TARGET = {
    "section": "Staff Engineer @ Acme — bullet 1",
    "current_text": "Built distributed payment processing",
    "improvement_type": "add_metric",
    "severity": "high",
    "notes": "No throughput / scale numbers",
}


def _claude_response(parsed: dict) -> dict:
    return {
        "parsed": parsed,
        "input_tokens": 800,
        "output_tokens": 200,
        "cost_usd": Decimal("0.005"),
    }


@pytest.mark.asyncio
async def test_proposal_path_returns_rewritten_text():
    parsed = {
        "kind": "proposal",
        "rewritten_text": "Architected distributed payment processing at Acme Corp",
        "rationale": "Stronger verb, ties to the company name in the source.",
    }
    with patch.object(
        rewrite_service,
        "call_claude_with_meta",
        new=AsyncMock(return_value=_claude_response(parsed)),
    ):
        result = await rewrite_service.run_rewrite(
            resume_markdown=_RESUME,
            target=_TARGET,
            hint=None,
            user_id=_FAKE_USER_ID,
            session_id=_FAKE_SESSION_ID,
        )
    assert result["kind"] == "proposal"
    assert "payment processing" in (result["rewritten_text"] or "")
    assert result["question"] is None
    assert result["hallucination_flagged"] == []


@pytest.mark.asyncio
async def test_clarify_path_returns_question():
    parsed = {
        "kind": "clarify",
        "question": "How many transactions per day did the system process?",
    }
    with patch.object(
        rewrite_service,
        "call_claude_with_meta",
        new=AsyncMock(return_value=_claude_response(parsed)),
    ):
        result = await rewrite_service.run_rewrite(
            resume_markdown=_RESUME,
            target=_TARGET,
            hint=None,
            user_id=_FAKE_USER_ID,
            session_id=_FAKE_SESSION_ID,
        )
    assert result["kind"] == "clarify"
    assert "transactions" in (result["question"] or "")


@pytest.mark.asyncio
async def test_hallucination_downgrades_proposal_to_clarify():
    """When the proposal introduces facts NOT in source, kind flips to clarify."""
    parsed = {
        "kind": "proposal",
        "rewritten_text": "Architected payment processing handling 500K transactions/day at Acme",
        "rationale": "Added scope.",
    }
    with patch.object(
        rewrite_service,
        "call_claude_with_meta",
        new=AsyncMock(return_value=_claude_response(parsed)),
    ):
        result = await rewrite_service.run_rewrite(
            resume_markdown=_RESUME,
            target=_TARGET,
            hint=None,
            user_id=_FAKE_USER_ID,
            session_id=_FAKE_SESSION_ID,
        )
    assert result["kind"] == "clarify"
    assert result["hallucination_flagged"]  # Non-empty list
    assert result["question"]  # Has a clarification question
    # The original proposal text is preserved on the response for traceability.
    assert "500K" in (result["rewritten_text"] or "")


@pytest.mark.asyncio
async def test_unknown_kind_falls_back_to_clarify():
    parsed = {"kind": "weird_unknown_kind"}
    with patch.object(
        rewrite_service,
        "call_claude_with_meta",
        new=AsyncMock(return_value=_claude_response(parsed)),
    ):
        result = await rewrite_service.run_rewrite(
            resume_markdown=_RESUME,
            target=_TARGET,
            hint=None,
            user_id=_FAKE_USER_ID,
            session_id=_FAKE_SESSION_ID,
        )
    assert result["kind"] == "clarify"
    assert result["question"]


@pytest.mark.asyncio
async def test_hint_passes_through_to_user_content():
    """The user's regeneration hint should appear in the prompt."""
    parsed = {"kind": "proposal", "rewritten_text": "ok", "rationale": "ok"}

    captured_user_content: list[str] = []

    async def fake_call(*, system_prompt, user_content, **_):
        captured_user_content.append(user_content)
        return _claude_response(parsed)

    with patch.object(rewrite_service, "call_claude_with_meta", new=AsyncMock(side_effect=fake_call)):
        await rewrite_service.run_rewrite(
            resume_markdown=_RESUME,
            target=_TARGET,
            hint="make it more concise",
            user_id=_FAKE_USER_ID,
            session_id=_FAKE_SESSION_ID,
        )
    assert any("more concise" in c for c in captured_user_content)


@pytest.mark.asyncio
async def test_prior_context_passes_through_to_user_content():
    """Session-level prior_context entries land in the prompt as a Prior
    conversation block, so Claude honours user-stated constraints across
    every target — not just the one a hint was attached to."""
    parsed = {"kind": "proposal", "rewritten_text": "ok", "rationale": "ok"}

    captured: list[str] = []

    async def fake_call(*, system_prompt, user_content, **_):
        captured.append(user_content)
        return _claude_response(parsed)

    prior_context = [
        {"kind": "ai_critique", "section": None, "text": "5 of 14 bullets need stronger verbs."},
        {
            "kind": "user_hint",
            "section": "Staff Engineer @ Acme — bullet 1",
            "text": "I left R1Soft out to keep the resume to one page.",
        },
        {
            "kind": "user_custom_rewrite",
            "section": "Senior Engineer @ Acme — bullet 2",
            "text": "Owned the migration end-to-end.",
        },
    ]

    with patch.object(
        rewrite_service, "call_claude_with_meta", new=AsyncMock(side_effect=fake_call)
    ):
        await rewrite_service.run_rewrite(
            resume_markdown=_RESUME,
            target=_TARGET,
            hint=None,
            user_id=_FAKE_USER_ID,
            session_id=_FAKE_SESSION_ID,
            prior_context=prior_context,
        )

    body = captured[0]
    assert "Prior conversation" in body
    assert "one page" in body
    assert "Owned the migration end-to-end" in body
    assert "[ai_critique]" in body
    assert "[user_hint]" in body
    assert "[user_custom_rewrite]" in body


@pytest.mark.asyncio
async def test_empty_prior_context_omits_block():
    """No prior_context (or an empty list) should NOT inject the heading
    — Claude shouldn't see a misleading 'Prior conversation' label with
    nothing under it."""
    parsed = {"kind": "proposal", "rewritten_text": "ok", "rationale": "ok"}

    captured: list[str] = []

    async def fake_call(*, system_prompt, user_content, **_):
        captured.append(user_content)
        return _claude_response(parsed)

    with patch.object(
        rewrite_service, "call_claude_with_meta", new=AsyncMock(side_effect=fake_call)
    ):
        await rewrite_service.run_rewrite(
            resume_markdown=_RESUME,
            target=_TARGET,
            hint=None,
            user_id=_FAKE_USER_ID,
            session_id=_FAKE_SESSION_ID,
            prior_context=[],
        )
        await rewrite_service.run_rewrite(
            resume_markdown=_RESUME,
            target=_TARGET,
            hint=None,
            user_id=_FAKE_USER_ID,
            session_id=_FAKE_SESSION_ID,
            prior_context=None,
        )

    for body in captured:
        assert "Prior conversation" not in body


def test_system_prompt_instructs_claude_to_clarify_on_vague_hint():
    """The rewrite prompt must explicitly tell Claude to return a clarify
    question when the user's hint is uninformative (e.g. ``temp``, ``asdf``).
    Without this guard, Claude regenerates near-identical proposals and the
    user sees what looks like a stuck loop. Reported by operator on
    2026-05-08."""
    from app.services.extraction.prompts.resume_rewrite_prompt import (
        RESUME_REWRITE_PROMPT,
    )
    # The prompt must reference uninformative-hint detection by example
    # so Claude has anchors for what counts as actionable signal.
    assert "uninformative" in RESUME_REWRITE_PROMPT.lower()
    assert "temp" in RESUME_REWRITE_PROMPT
    assert "asdf" in RESUME_REWRITE_PROMPT
    # And it must direct Claude to ``clarify``, not regenerate.
    assert "kind=clarify" in RESUME_REWRITE_PROMPT or "kind=\"clarify\"" in RESUME_REWRITE_PROMPT
    # And it must instruct echoing the user's input back, so they know
    # their submission was observed and not silently dropped.
    assert "echo" in RESUME_REWRITE_PROMPT.lower()
