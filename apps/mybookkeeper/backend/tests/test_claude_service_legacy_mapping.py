"""Regression contract for the MBK legacy extraction-dict mapping.

The pre-extraction ``_parse_response`` return shape (year_end_statement
special-case, ``documents``/``invoices`` unwrap, single-dict wrap,
low-confidence fallback on any parse/shape failure) is load-bearing —
document_extraction_service, email_extraction_service and the
persistence layer all consume these exact keys. Post-extraction the
parsing is split (shared ``_parse_message`` raises ``ExtractionParseError``;
this module interprets). These tests pin the mapping directly rather
than only transitively via test_extraction_to_transactions.
"""
from __future__ import annotations

import pytest

from app.services.extraction import claude_service
from platform_shared.extraction import ExtractionParseError, ExtractionResponse


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
        # Pre-extraction behaviour: a bare JSON list has no .get →
        # AttributeError, which the caller converts to the fallback.
        with pytest.raises(AttributeError):
            claude_service._legacy_from_response(_resp([{"vendor": "Acme"}]))


class TestToLegacy:
    def test_bare_list_falls_back(self) -> None:
        out = claude_service._to_legacy(_resp([{"vendor": "Acme"}]))
        assert out == claude_service._legacy_fallback()

    def test_dict_passes_through(self) -> None:
        out = claude_service._to_legacy(_resp({"vendor": "Acme"}))
        assert out["data"] == [{"vendor": "Acme"}]


class TestLegacyFallbackShape:
    def test_exact_shape(self) -> None:
        # Must stay byte-identical to the pre-extraction fallback dict —
        # downstream mappers key off these fields.
        assert claude_service._legacy_fallback() == {
            "data": [{"tags": ["uncategorized"], "confidence": "low", "tax_relevant": False}],
            "tokens": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "model_name": None,
        }


class TestExtractFromTextFallbackPath:
    async def test_parse_error_yields_fallback(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _fake_prompt(*_a, **_k):
            return ("PROMPT", None)

        async def _raise_parse(*_a, **_k):
            raise ExtractionParseError("bad json")

        monkeypatch.setattr(claude_service, "get_extraction_prompt", _fake_prompt)
        monkeypatch.setattr(claude_service._extraction, "extract_text", _raise_parse)

        out = await claude_service.extract_from_text("some text")
        assert out == claude_service._legacy_fallback()

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
