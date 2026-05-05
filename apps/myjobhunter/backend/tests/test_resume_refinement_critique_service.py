"""Tests for the critique service. Mocks the Claude API call."""
from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.services.resume_refinement import critique_service
from app.services.resume_refinement.errors import CritiqueRetryExceeded


_FAKE_USER_ID = uuid.uuid4()
_FAKE_SESSION_ID = uuid.uuid4()


def _claude_response(targets: list[dict]) -> dict:
    return {
        "parsed": {"targets": targets},
        "input_tokens": 1000,
        "output_tokens": 500,
        "cost_usd": Decimal("0.010"),
    }


@pytest.mark.asyncio
async def test_run_critique_returns_normalized_targets():
    targets = [
        {
            "section": "Senior Engineer @ Acme — bullet 2",
            "current_text": "Worked on backend systems",
            "improvement_type": "stronger_verb",
            "severity": "high",
            "notes": "Weak verb",
        },
    ]
    with patch.object(
        critique_service,
        "call_claude_with_meta",
        new=AsyncMock(return_value=_claude_response(targets)),
    ):
        result = await critique_service.run_critique(
            resume_markdown="# Resume",
            user_id=_FAKE_USER_ID,
            session_id=_FAKE_SESSION_ID,
        )
    assert len(result["targets"]) == 1
    assert result["targets"][0]["section"] == "Senior Engineer @ Acme — bullet 2"
    assert result["input_tokens"] == 1000
    assert result["output_tokens"] == 500


@pytest.mark.asyncio
async def test_run_critique_raises_when_no_targets():
    with patch.object(
        critique_service,
        "call_claude_with_meta",
        new=AsyncMock(return_value=_claude_response([])),
    ):
        with pytest.raises(CritiqueRetryExceeded):
            await critique_service.run_critique(
                resume_markdown="# Resume",
                user_id=_FAKE_USER_ID,
                session_id=_FAKE_SESSION_ID,
            )


@pytest.mark.asyncio
async def test_run_critique_normalizes_invalid_enum_values():
    targets = [
        {
            "section": "Foo",
            "current_text": "Bar",
            "improvement_type": "bogus_type",   # invalid → 'other'
            "severity": "extreme",               # invalid → 'medium'
        },
    ]
    with patch.object(
        critique_service,
        "call_claude_with_meta",
        new=AsyncMock(return_value=_claude_response(targets)),
    ):
        result = await critique_service.run_critique(
            resume_markdown="# Resume",
            user_id=_FAKE_USER_ID,
            session_id=_FAKE_SESSION_ID,
        )
    target = result["targets"][0]
    assert target["improvement_type"] == "other"
    assert target["severity"] == "medium"


@pytest.mark.asyncio
async def test_run_critique_drops_targets_missing_required_fields():
    targets = [
        {
            "section": "Valid",
            "current_text": "Some text",
            "improvement_type": "tighten_phrasing",
            "severity": "medium",
        },
        # Missing `current_text` — should be dropped silently.
        {
            "section": "Invalid",
            "improvement_type": "tighten_phrasing",
            "severity": "medium",
        },
    ]
    with patch.object(
        critique_service,
        "call_claude_with_meta",
        new=AsyncMock(return_value=_claude_response(targets)),
    ):
        result = await critique_service.run_critique(
            resume_markdown="# Resume",
            user_id=_FAKE_USER_ID,
            session_id=_FAKE_SESSION_ID,
        )
    assert len(result["targets"]) == 1
    assert result["targets"][0]["section"] == "Valid"
