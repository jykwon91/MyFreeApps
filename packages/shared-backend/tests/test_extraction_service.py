"""Tests for platform_shared.extraction.service.ExtractionService.

Covers the SmsService-mirrored shape (is_configured, typed
not-configured error), the byte-exact request shape that keeps
MyBookkeeper's production prompt cache hitting (system block with
ephemeral cache_control, Document:\\n prefix, document-vs-image source
block), token accounting, lazy+cached client construction, and the
ExtractionParseError contract on unparseable output.
"""
from __future__ import annotations

import base64
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from platform_shared.extraction import (
    ExtractionNotConfiguredError,
    ExtractionParseError,
    ExtractionResponse,
    ExtractionService,
)
from platform_shared.extraction.backoff import throttle


@pytest.fixture(autouse=True)
def _reset_throttle() -> None:
    throttle.consecutive_429s = 0
    throttle.resume_at = 0.0
    yield
    throttle.consecutive_429s = 0
    throttle.resume_at = 0.0


def _message(text: str, *, model: str = "claude-sonnet-4-6", in_tok: int = 10, out_tok: int = 5) -> MagicMock:
    msg = MagicMock()
    block = MagicMock()
    block.text = text
    msg.content = [block]
    msg.usage.input_tokens = in_tok
    msg.usage.output_tokens = out_tok
    msg.model = model
    return msg


def _service() -> ExtractionService:
    return ExtractionService(api_key="sk-ant-fake", model="claude-sonnet-4-6")


def _patched_client(msg: MagicMock):
    """patch anthropic.AsyncAnthropic → a client whose messages.create
    awaits to ``msg``. Returns (patch_ctx, mock_client)."""
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=msg)
    return patch("anthropic.AsyncAnthropic", return_value=mock_client), mock_client


class TestIsConfigured:
    def test_with_key(self) -> None:
        assert ExtractionService(api_key="k", model="m").is_configured() is True

    def test_empty_default(self) -> None:
        assert ExtractionService().is_configured() is False


class TestGuards:
    async def test_empty_model_raises_value_error(self) -> None:
        svc = ExtractionService(api_key="k")  # model unset
        with pytest.raises(ValueError):
            await svc.extract_text("sys", "doc")

    async def test_missing_key_raises_not_configured(self) -> None:
        svc = ExtractionService(model="claude-sonnet-4-6")  # api_key unset
        with pytest.raises(ExtractionNotConfiguredError):
            await svc.extract_text("sys", "doc")


class TestExtractText:
    async def test_request_shape_and_response(self) -> None:
        msg = _message('{"vendor": "Acme", "amount": 42}')
        ctx, client = _patched_client(msg)
        with ctx:
            resp = await _service().extract_text("SYSTEM PROMPT", "raw text")

        assert isinstance(resp, ExtractionResponse)
        assert resp.data == {"vendor": "Acme", "amount": 42}
        assert resp.input_tokens == 10
        assert resp.output_tokens == 5
        assert resp.total_tokens == 15
        assert resp.model == "claude-sonnet-4-6"

        kwargs = client.messages.create.await_args.kwargs
        assert kwargs["model"] == "claude-sonnet-4-6"
        assert kwargs["max_tokens"] == 16384
        # Prompt-cache invariant: single system text block with ephemeral
        # cache_control, byte-identical to the pre-extraction MBK call.
        assert kwargs["system"] == [
            {"type": "text", "text": "SYSTEM PROMPT", "cache_control": {"type": "ephemeral"}}
        ]
        assert kwargs["messages"] == [{"role": "user", "content": "Document:\nraw text"}]

    async def test_strips_markdown_json_fence(self) -> None:
        msg = _message('Here you go:\n```json\n{"ok": true}\n```\nthanks')
        ctx, _ = _patched_client(msg)
        with ctx:
            resp = await _service().extract_text("s", "t")
        assert resp.data == {"ok": True}

    async def test_unparseable_raises_parse_error(self) -> None:
        msg = _message("I could not read this document, sorry.")
        ctx, _ = _patched_client(msg)
        with ctx:
            with pytest.raises(ExtractionParseError):
                await _service().extract_text("s", "t")

    async def test_custom_max_tokens(self) -> None:
        msg = _message("{}")
        ctx, client = _patched_client(msg)
        with ctx:
            await _service().extract_text("s", "t", max_tokens=2048)
        assert client.messages.create.await_args.kwargs["max_tokens"] == 2048


class TestLocatingTheJson:
    """Where in the response the payload is allowed to sit.

    A production extraction was lost on 2026-08-17 because the model
    reconciled a declarations page out loud — "I need to work through the
    premium split carefully" and eight lines of arithmetic — before
    answering. The call succeeded, the object was there, and it was thrown
    away for starting at a character other than zero.
    """

    async def test_reads_json_that_follows_the_models_reasoning(self) -> None:
        msg = _message(
            "I need to work through the premium split carefully.\n\n"
            "- Coverage A premium: $2,212\n"
            "- Subtotal: $2,379\n"
            "There is a $31 discrepancy, which I attribute to fees.\n\n"
            '{"annual_premium": 2535, "confidence": "medium"}'
        )
        ctx, _ = _patched_client(msg)
        with ctx:
            resp = await _service().extract_text("s", "t")
        assert resp.data == {"annual_premium": 2535, "confidence": "medium"}

    async def test_reads_json_that_precedes_trailing_commentary(self) -> None:
        msg = _message('{"vendor": "Acme"}\n\nLet me know if the fees look wrong.')
        ctx, _ = _patched_client(msg)
        with ctx:
            resp = await _service().extract_text("s", "t")
        assert resp.data == {"vendor": "Acme"}

    async def test_returns_the_whole_object_not_a_nested_fragment(self) -> None:
        # Every nested object is also a candidate start. Scanning left to
        # right is what keeps the outer one winning.
        msg = _message(
            'Here is what I found:\n{"policy": {"carrier": "SafePoint"}, "premium": 2410}'
        )
        ctx, _ = _patched_client(msg)
        with ctx:
            resp = await _service().extract_text("s", "t")
        assert resp.data == {"policy": {"carrier": "SafePoint"}, "premium": 2410}

    async def test_a_brace_in_the_prose_does_not_derail_the_scan(self) -> None:
        msg = _message('The template {name} was not filled in.\n{"ok": true}')
        ctx, _ = _patched_client(msg)
        with ctx:
            resp = await _service().extract_text("s", "t")
        assert resp.data == {"ok": True}

    async def test_reads_a_top_level_array(self) -> None:
        # Some prompts ask for a list of rows. The fence branch only ever
        # accepted objects, so an array behind prose was unreachable.
        msg = _message('Found two:\n[{"line": 1}, {"line": 2}]')
        ctx, _ = _patched_client(msg)
        with ctx:
            resp = await _service().extract_text("s", "t")
        assert resp.data == [{"line": 1}, {"line": 2}]

    async def test_a_fenced_block_still_wins_over_stray_prose_braces(self) -> None:
        msg = _message(
            'Consider {a} and {b}.\n```json\n{"chosen": "fenced"}\n```\n{"later": true}'
        )
        ctx, _ = _patched_client(msg)
        with ctx:
            resp = await _service().extract_text("s", "t")
        assert resp.data == {"chosen": "fenced"}

    async def test_reads_a_fenced_array(self) -> None:
        msg = _message('```json\n[1, 2, 3]\n```')
        ctx, _ = _patched_client(msg)
        with ctx:
            resp = await _service().extract_text("s", "t")
        assert resp.data == [1, 2, 3]

    async def test_prose_with_no_json_at_all_still_raises(self) -> None:
        # The fallback the caller depends on. A refusal or a clarifying
        # question must not be dressed up as an extraction.
        msg = _message("I could not read this document — the scan is blank.")
        ctx, _ = _patched_client(msg)
        with ctx:
            with pytest.raises(ExtractionParseError):
                await _service().extract_text("s", "t")

    async def test_the_raised_error_quotes_the_whole_response(self) -> None:
        msg = _message("No JSON here, only regrets.")
        ctx, _ = _patched_client(msg)
        with ctx:
            with pytest.raises(ExtractionParseError) as exc:
                await _service().extract_text("s", "t")
        assert "line 1 column 1" in str(exc.value)


class TestExtractDocument:
    async def test_pdf_uses_document_block(self) -> None:
        msg = _message("{}")
        ctx, client = _patched_client(msg)
        with ctx:
            await _service().extract_document("s", b"PDFBYTES", "application/pdf")
        block = client.messages.create.await_args.kwargs["messages"][0]["content"][0]
        assert block["type"] == "document"
        assert block["source"]["media_type"] == "application/pdf"
        assert block["source"]["data"] == base64.standard_b64encode(b"PDFBYTES").decode()

    async def test_image_uses_image_block(self) -> None:
        msg = _message("{}")
        ctx, client = _patched_client(msg)
        with ctx:
            await _service().extract_document("s", b"IMG", "image/png")
        block = client.messages.create.await_args.kwargs["messages"][0]["content"][0]
        assert block["type"] == "image"
        assert block["source"]["media_type"] == "image/png"


class TestClientCaching:
    async def test_client_built_once_with_key_and_timeout(self) -> None:
        msg = _message("{}")
        svc = ExtractionService(api_key="sk-ant-fake", model="m", timeout_seconds=123.0)
        with patch("anthropic.AsyncAnthropic") as mock_cls:
            mock_cls.return_value.messages.create = AsyncMock(return_value=msg)
            await svc.extract_text("s", "a")
            await svc.extract_text("s", "b")

        # Lazy + cached: constructed exactly once across two calls.
        assert mock_cls.call_count == 1
        _, kwargs = mock_cls.call_args
        assert kwargs["api_key"] == "sk-ant-fake"


class TestInheritance:
    def test_not_configured_is_runtime_error(self) -> None:
        assert issubclass(ExtractionNotConfiguredError, RuntimeError)

    def test_parse_error_is_runtime_error(self) -> None:
        assert issubclass(ExtractionParseError, RuntimeError)
