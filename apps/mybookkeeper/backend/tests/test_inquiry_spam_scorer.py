"""Pure-function tests for the spam scorer's prompt building + parsing (T0).

The Anthropic call itself is mocked at the public_inquiry_service test layer.
Here we cover the prompt construction (PII redaction) and the JSON parser.
"""
from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock

import anthropic
import httpx
import pytest

from app.core.config import settings
from app.services.inquiries import inquiry_spam_scorer
from app.services.inquiries.inquiry_spam_scorer import (
    _build_prompt,
    _parse_response,
    _redact,
)


class TestRedact:
    def test_redacts_email(self) -> None:
        out = _redact("Reach me at alice@example.com please.")
        assert "alice@example.com" not in out
        assert "[redacted-email]" in out

    def test_redacts_phone(self) -> None:
        out = _redact("Call me at 555-123-4567.")
        assert "555-123-4567" not in out
        assert "[redacted-phone]" in out

    def test_handles_empty(self) -> None:
        assert _redact(None) == ""
        assert _redact("") == ""


class TestBuildPrompt:
    def test_prompt_excludes_inquirer_pii(self) -> None:
        prompt = _build_prompt(
            name="Alice Smith",
            email="alice@example.com",
            phone="555-1234567",
            current_city="Austin",
            current_country="US",
            current_region="TX",
            employment_status="employed",
            move_in_date="2026-06-01",
            move_out_date="2026-12-01",
            occupant_count=1,
            has_pets=False,
            pets_description=None,
            vehicle_count=0,
            why_this_room="Need a place close to the hospital.",
            additional_notes=None,
            listing_address="[private]",
            listing_monthly_rent="1500.00",
            listing_type="private_room",
        )
        # Name, email, phone never appear in the assembled prompt
        assert "Alice Smith" not in prompt
        assert "alice@example.com" not in prompt
        assert "555-1234567" not in prompt
        # But context that's safe to share IS present
        assert "Austin" in prompt
        assert "TX" in prompt
        assert "US" in prompt
        assert "employed" in prompt
        assert "1500.00" in prompt

    def test_prompt_redacts_pii_in_freeform_fields(self) -> None:
        prompt = _build_prompt(
            name="N",
            email="e@e.com",
            phone="555",
            current_city="X",
            current_country="US",
            current_region="TX",
            employment_status="employed",
            move_in_date="2026-06-01",
            move_out_date="2026-12-01",
            occupant_count=1,
            has_pets=False,
            pets_description=None,
            vehicle_count=0,
            why_this_room="My phone is 555-867-5309 and email is bob@spam.com",
            additional_notes=None,
            listing_address="[private]",
            listing_monthly_rent="0",
            listing_type="private_room",
        )
        assert "555-867-5309" not in prompt
        assert "bob@spam.com" not in prompt
        assert "[redacted-phone]" in prompt
        assert "[redacted-email]" in prompt


class TestParseResponse:
    def test_parses_clean_json(self) -> None:
        score, reason, flags = _parse_response('{"score": 85, "reason": "ok", "flags": []}')
        assert score == 85
        assert reason == "ok"
        assert flags == []

    def test_parses_fenced_json(self) -> None:
        raw = '```json\n{"score": 50, "reason": "borderline", "flags": ["vague_movein"]}\n```'
        score, reason, flags = _parse_response(raw)
        assert score == 50
        assert flags == ["vague_movein"]

    def test_clamps_string_lengths(self) -> None:
        import json as _json
        long_reason = "x" * 1000
        long_flags = ["a"] * 50
        raw = _json.dumps({"score": 90, "reason": long_reason, "flags": long_flags})
        score, reason, flags = _parse_response(raw)
        assert score == 90
        assert len(reason) <= 500
        assert len(flags) <= 20

    def test_rejects_out_of_range_score(self) -> None:
        with pytest.raises(ValueError):
            _parse_response('{"score": 200, "reason": "x", "flags": []}')

    def test_rejects_malformed(self) -> None:
        with pytest.raises(Exception):
            _parse_response("not json at all")


# Model ids the app's Claude callers are known to use: MBK extraction / tax /
# lease callers (claude-sonnet-4-6) plus the Haiku id MyLanguageTutor configures.
KNOWN_CLAUDE_MODEL_IDS = frozenset({"claude-haiku-4-5", "claude-sonnet-4-6"})

_SCORE_KWARGS = dict(
    name="N", email="e@e.com", phone="5551234567", current_city="Austin",
    current_country="US", current_region="TX", employment_status="employed",
    move_in_date="2026-06-01", move_out_date="2026-12-01", occupant_count=1,
    has_pets=False, pets_description=None, vehicle_count=0,
    why_this_room="Need a place close to the hospital for my assignment.",
    additional_notes=None, listing_address="[private]",
    listing_monthly_rent="1500", listing_type="private_room",
)


def _status_error(cls: type[anthropic.APIStatusError], status: int, error_type: str) -> anthropic.APIStatusError:
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(status, request=request)
    return cls(
        "boom", response=response,
        body={"type": "error", "error": {"type": error_type, "message": "boom"}},
    )


def _client_raising(exc: Exception) -> MagicMock:
    client = MagicMock()
    client.messages.create = AsyncMock(side_effect=exc)
    return client


class TestModelConfig:
    def test_configured_model_is_one_the_app_uses(self) -> None:
        assert settings.inquiry_spam_model in KNOWN_CLAUDE_MODEL_IDS

    @pytest.mark.asyncio
    async def test_call_uses_configured_model(self) -> None:
        client = MagicMock()
        client.messages.create = AsyncMock(
            return_value=MagicMock(content=[MagicMock(text='{"score": 80, "reason": "ok", "flags": []}')]),
        )
        result = await inquiry_spam_scorer.score_inquiry(**_SCORE_KWARGS, client=client)
        assert isinstance(result, inquiry_spam_scorer.ClaudeScoringResult)
        assert client.messages.create.await_args.kwargs["model"] == settings.inquiry_spam_model


class TestFailureReporting:
    @pytest.mark.asyncio
    async def test_not_found_model_is_logged_at_error_with_type_and_status(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        client = _client_raising(_status_error(anthropic.NotFoundError, 404, "not_found_error"))
        with caplog.at_level(logging.WARNING):
            result = await inquiry_spam_scorer.score_inquiry(**_SCORE_KWARGS, client=client)
        assert isinstance(result, inquiry_spam_scorer.ClaudeScoringDegraded)
        assert result.error_type == "not_found_error"
        assert result.status == 404
        errors = [r for r in caplog.records if r.levelno == logging.ERROR]
        assert errors and "not_found_error" in errors[0].getMessage()

    @pytest.mark.asyncio
    async def test_auth_failure_is_logged_at_error(self, caplog: pytest.LogCaptureFixture) -> None:
        client = _client_raising(_status_error(anthropic.AuthenticationError, 401, "authentication_error"))
        with caplog.at_level(logging.WARNING):
            result = await inquiry_spam_scorer.score_inquiry(**_SCORE_KWARGS, client=client)
        assert isinstance(result, inquiry_spam_scorer.ClaudeScoringDegraded)
        assert result.error_type == "authentication_error"
        assert any(r.levelno == logging.ERROR for r in caplog.records)

    @pytest.mark.asyncio
    async def test_rate_limit_degrades_at_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        client = _client_raising(_status_error(anthropic.RateLimitError, 429, "rate_limit_error"))
        with caplog.at_level(logging.WARNING):
            result = await inquiry_spam_scorer.score_inquiry(**_SCORE_KWARGS, client=client)
        assert isinstance(result, inquiry_spam_scorer.ClaudeScoringDegraded)
        assert result.error_type == "rate_limit_error"
        assert result.status == 429
        assert not any(r.levelno >= logging.ERROR for r in caplog.records)

    @pytest.mark.asyncio
    async def test_timeout_degrades_as_connection_error(self) -> None:
        request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        client = _client_raising(anthropic.APITimeoutError(request=request))
        result = await inquiry_spam_scorer.score_inquiry(**_SCORE_KWARGS, client=client)
        assert isinstance(result, inquiry_spam_scorer.ClaudeScoringDegraded)
        assert result.error_type == "connection_error"
        assert result.status is None

    @pytest.mark.asyncio
    async def test_bad_json_is_reported_as_parse_failure(self) -> None:
        client = MagicMock()
        client.messages.create = AsyncMock(
            return_value=MagicMock(content=[MagicMock(text="not json")]),
        )
        result = await inquiry_spam_scorer.score_inquiry(**_SCORE_KWARGS, client=client)
        assert isinstance(result, inquiry_spam_scorer.ClaudeScoringDegraded)
        assert result.error_type == "claude_parse_failed"
        assert result.raw_response == "not json"

    @pytest.mark.asyncio
    async def test_unexpected_exception_propagates(self) -> None:
        client = _client_raising(RuntimeError("bug"))
        with pytest.raises(RuntimeError):
            await inquiry_spam_scorer.score_inquiry(**_SCORE_KWARGS, client=client)
