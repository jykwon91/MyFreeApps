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
