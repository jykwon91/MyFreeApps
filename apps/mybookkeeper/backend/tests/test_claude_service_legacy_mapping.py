"""Regression contract for the MBK legacy extraction-dict mapping.

The pre-extraction ``_parse_response`` return shape (year_end_statement
special-case, ``documents``/``invoices`` unwrap, single-dict wrap) is
load-bearing —
document_extraction_service, email_extraction_service and the
persistence layer all consume these exact keys. Post-extraction the
parsing is split (shared ``_parse_message`` raises ``ExtractionParseError``;
this module interprets). These tests pin the mapping directly rather
than only transitively via test_extraction_to_transactions.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest
from platform_shared.extraction.backoff import RateLimitEvent

from app.services.extraction import claude_service
from platform_shared.extraction import ExtractionParseError, ExtractionResponse, ExtractionTruncatedError


def _resp(data: object) -> ExtractionResponse:
    return ExtractionResponse(
        data=data, input_tokens=10, output_tokens=5, total_tokens=15, model="claude-sonnet-4-6"
    )


class TestLegacyFromResponse:
    def test_year_end_statement_special_case(self) -> None:
        out = claude_service._legacy_from_response(
            _resp({"document_type": "year_end_statement", "reservations": [{"n": 1}]})
        )
        assert out == {
            "data": [],
            "document_type": "year_end_statement",
            "reservations": [{"n": 1}],
            "tokens": 15,
            "input_tokens": 10,
            "output_tokens": 5,
            "model_name": "claude-sonnet-4-6",
        }

    def test_year_end_statement_missing_reservations_defaults_empty(self) -> None:
        out = claude_service._legacy_from_response(_resp({"document_type": "year_end_statement"}))
        assert out["reservations"] == []
        assert out["data"] == []

    def test_documents_key_unwrapped(self) -> None:
        out = claude_service._legacy_from_response(_resp({"documents": [{"a": 1}, {"a": 2}]}))
        assert out["data"] == [{"a": 1}, {"a": 2}]
        assert out["tokens"] == 15 and out["model_name"] == "claude-sonnet-4-6"

    def test_invoices_key_unwrapped(self) -> None:
        out = claude_service._legacy_from_response(_resp({"invoices": [{"v": "x"}]}))
        assert out["data"] == [{"v": "x"}]

    def test_single_dict_wrapped_in_list(self) -> None:
        out = claude_service._legacy_from_response(_resp({"vendor": "Acme", "amount": 9}))
        assert out["data"] == [{"vendor": "Acme", "amount": 9}]

    def test_non_dict_raises_attribute_error(self) -> None:
        # A bare JSON list has no .get → AttributeError, which _to_legacy
        # turns into ExtractionParseError.
        with pytest.raises(AttributeError):
            claude_service._legacy_from_response(_resp([{"vendor": "Acme"}]))


class TestToLegacy:
    def test_bare_list_is_a_parse_error_not_a_placeholder(self) -> None:
        with pytest.raises(ExtractionParseError):
            claude_service._to_legacy(_resp([{"vendor": "Acme"}]))

    def test_dict_passes_through(self) -> None:
        out = claude_service._to_legacy(_resp({"vendor": "Acme"}))
        assert out["data"] == [{"vendor": "Acme"}]


class TestExtractFromTextFailedRead:
    @pytest.mark.parametrize(
        "error",
        [ExtractionParseError("bad json"), ExtractionTruncatedError("cut off at max_tokens")],
    )
    async def test_unreadable_or_cut_off_reply_raises_instead_of_a_placeholder(
        self, monkeypatch: pytest.MonkeyPatch, error: ExtractionParseError,
    ) -> None:
        # It used to return a low-confidence "uncategorized" placeholder,
        # which the email queue skipped and marked done: the invoice was
        # dropped for good. The queues now retry the raised error.
        async def _fake_prompt(*_a, **_k):
            return ("PROMPT", None)

        async def _raise(*_a, **_k):
            raise error

        monkeypatch.setattr(claude_service, "get_extraction_prompt", _fake_prompt)
        monkeypatch.setattr(claude_service._extraction, "extract_text", _raise)

        with pytest.raises(type(error)):
            await claude_service.extract_from_text("some text")

    async def test_image_reply_that_is_not_an_object_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _fake_prompt(*_a, **_k):
            return ("PROMPT", None)

        async def _list(*_a, **_k):
            return _resp(["not", "an", "extraction"])

        monkeypatch.setattr(claude_service, "get_extraction_prompt", _fake_prompt)
        monkeypatch.setattr(claude_service._extraction, "extract_document", _list)

        with pytest.raises(ExtractionParseError):
            await claude_service.extract_from_image(b"img", "image/png")

    async def test_extraction_never_sleeps_on_a_rate_limit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Both callers are queues that retry later; a sleep inside the call
        # ran past the item's time limit.
        seen: dict[str, object] = {}

        async def _fake_prompt(*_a, **_k):
            return ("PROMPT", None)

        async def _ok(*_a, **kwargs):
            seen.update(kwargs)
            return _resp({"vendor": "Z"})

        monkeypatch.setattr(claude_service, "get_extraction_prompt", _fake_prompt)
        monkeypatch.setattr(claude_service._extraction, "extract_text", _ok)

        await claude_service.extract_from_text("some text")
        assert seen["max_wait_seconds"] == 0

    async def test_queue_reads_make_one_request_with_no_sdk_retries(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # The SDK's own retries (two by default, each up to the client
        # timeout) would run past the per-read time limit; the queues retry.
        seen: list[dict[str, object]] = []

        async def _fake_prompt(*_a, **_k):
            return ("PROMPT", None)

        async def _ok(*_a, **kwargs):
            seen.append(kwargs)
            return _resp({"vendor": "Z"})

        monkeypatch.setattr(claude_service, "get_extraction_prompt", _fake_prompt)
        monkeypatch.setattr(claude_service._extraction, "extract_text", _ok)
        monkeypatch.setattr(claude_service._extraction, "extract_document", _ok)

        await claude_service.extract_from_text("some text")
        await claude_service.extract_from_image(b"img", "image/png")
        assert [k["max_retries"] for k in seen] == [0, 0]

    async def test_each_read_has_its_own_time_limit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _fake_prompt(*_a, **_k):
            return ("PROMPT", None)

        async def _hangs(*_a, **_k):
            await asyncio.sleep(5)

        monkeypatch.setattr(claude_service, "get_extraction_prompt", _fake_prompt)
        monkeypatch.setattr(claude_service._extraction, "extract_text", _hangs)
        monkeypatch.setattr(claude_service, "CLAUDE_READ_TIMEOUT_SECONDS", 0.01)

        with pytest.raises(TimeoutError):
            await claude_service.extract_from_text("some text")


class TestRecordReads:
    """Utility plan, mortgage and insurance reads used to turn a bad reply into ``{}``."""

    @pytest.mark.parametrize(
        "error", [ExtractionParseError("bad json"), ExtractionTruncatedError("cut off at max_tokens")],
    )
    async def test_an_unreadable_reply_raises_instead_of_an_empty_form(
        self, monkeypatch: pytest.MonkeyPatch, error: ExtractionParseError,
    ) -> None:
        async def _fail(*_a, **_k):
            raise error

        monkeypatch.setattr(claude_service._extraction, "extract_text", _fail)

        with pytest.raises(type(error)):
            await claude_service.run_utility_plan_extraction(text="plan terms")

    async def test_a_reply_that_is_not_an_object_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _list(*_a, **_k):
            return _resp(["not", "an", "object"])

        monkeypatch.setattr(claude_service._extraction, "extract_text", _list)

        with pytest.raises(ExtractionParseError):
            await claude_service.run_utility_plan_extraction(text="plan terms")

    async def test_success_maps_to_legacy(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _fake_prompt(*_a, **_k):
            return ("PROMPT", None)

        async def _ok(*_a, **_k):
            return _resp({"invoices": [{"vendor": "Z"}]})

        monkeypatch.setattr(claude_service, "get_extraction_prompt", _fake_prompt)
        monkeypatch.setattr(claude_service._extraction, "extract_text", _ok)

        out = await claude_service.extract_from_text("some text")
        assert out["data"] == [{"vendor": "Z"}]
        assert out["model_name"] == "claude-sonnet-4-6"


class TestRateLimitedEvent:
    async def _message(self, monkeypatch: pytest.MonkeyPatch, evt: RateLimitEvent) -> tuple[str, dict]:
        record = AsyncMock()
        monkeypatch.setattr(claude_service, "record_event", record)
        await claude_service._record_rate_limited(evt)
        _org, _type, _severity, message, data = record.await_args.args
        return message, data

    async def test_a_429_that_is_not_retried_does_not_claim_an_attempt_count(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        evt = RateLimitEvent(attempt=1, max_attempts=5, wait_seconds=30, consecutive_429s=2, will_retry=False)
        message, data = await self._message(monkeypatch, evt)
        assert "1/5" not in message
        assert "not retried" in message
        assert data["will_retry"] is False

    async def test_a_429_that_is_retried_says_which_attempt(self, monkeypatch: pytest.MonkeyPatch) -> None:
        evt = RateLimitEvent(attempt=2, max_attempts=5, wait_seconds=30, consecutive_429s=2, will_retry=True)
        message, data = await self._message(monkeypatch, evt)
        assert "attempt 2/5" in message
        assert data["will_retry"] is True
