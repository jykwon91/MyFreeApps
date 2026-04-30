"""Pure-function tests for the spam scorer's prompt building + parsing (T0).

The Anthropic call itself is mocked at the public_inquiry_service test layer.
Here we cover the prompt construction (PII redaction) and the JSON parser.
"""
from __future__ import annotations

import pytest

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
            current_city="Austin, TX",
            employment_status="employed",
            move_in_date="2026-06-01",
            lease_length_months=6,
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
        assert "Austin, TX" in prompt
        assert "employed" in prompt
        assert "1500.00" in prompt

    def test_prompt_redacts_pii_in_freeform_fields(self) -> None:
        prompt = _build_prompt(
            name="N",
            email="e@e.com",
            phone="555",
            current_city="X",
            employment_status="employed",
            move_in_date="2026-06-01",
            lease_length_months=6,
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
