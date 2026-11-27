"""Tests for platform_shared.extraction.research.ResearchService.

Covers the request shape (server-tool declaration, structured-output
format, cached system block), the ``pause_turn`` resume loop, source
collection across round-trips, the server-tool-error path that returns an
error *object* where success returns a *list*, payload extraction from the
last text block, and the typed-error contract that keeps ``anthropic``
exceptions from leaking to callers.
"""
from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import httpx
import pytest

from platform_shared.extraction import (
    AnthropicFailureKind,
    ExtractionError,
    ExtractionNotConfiguredError,
    ExtractionParseError,
    ExtractionTruncatedError,
    ResearchRefusedError,
    ResearchService,
    WebSource,
)
from platform_shared.extraction.backoff import throttle

SCHEMA = {"type": "object", "properties": {"ok": {"type": "boolean"}}}


@pytest.fixture(autouse=True)
def _reset_throttle():
    throttle.consecutive_429s = 0
    throttle.resume_at = 0.0
    yield
    throttle.consecutive_429s = 0
    throttle.resume_at = 0.0


# ---------------------------------------------------------------------------
# Block / message builders. MagicMock attribute access invents attributes, so
# every block sets exactly the fields the parser reads and nothing else.
# ---------------------------------------------------------------------------


def _text_block(text: str) -> MagicMock:
    block = MagicMock()
    block.type = "text"
    block.text = text
    return block


def _server_tool_use_block() -> MagicMock:
    block = MagicMock()
    block.type = "server_tool_use"
    return block


def _search_result_block(*pairs: tuple[str, str]) -> MagicMock:
    """A successful web_search result: ``content`` is a LIST of results."""
    block = MagicMock()
    block.type = "web_search_tool_result"
    results = []
    for url, title in pairs:
        item = MagicMock()
        item.url = url
        item.title = title
        results.append(item)
    block.content = results
    return block


def _search_error_block(error_code: str) -> MagicMock:
    """A failed server tool: ``content`` is a single error OBJECT, not a list."""
    block = MagicMock()
    block.type = "web_search_tool_result"
    content = MagicMock()
    content.error_code = error_code
    block.content = content
    return block


def _fetch_result_block(url: str, title: str) -> MagicMock:
    block = MagicMock()
    block.type = "web_fetch_tool_result"
    content = MagicMock()
    content.error_code = None
    content.url = url
    content.document.title = title
    block.content = content
    return block


def _message(
    blocks: list[MagicMock],
    *,
    stop_reason: str = "end_turn",
    in_tok: int = 100,
    out_tok: int = 20,
    model: str = "claude-opus-5",
    searches: int = 0,
    fetches: int = 0,
    refusal_category: str | None = None,
    cache_read: int = 0,
    cache_write: int = 0,
) -> MagicMock:
    msg = MagicMock()
    msg.content = blocks
    msg.stop_reason = stop_reason
    msg.usage.input_tokens = in_tok
    msg.usage.output_tokens = out_tok
    msg.usage.cache_read_input_tokens = cache_read
    msg.usage.cache_creation_input_tokens = cache_write
    msg.usage.server_tool_use.web_search_requests = searches
    msg.usage.server_tool_use.web_fetch_requests = fetches
    msg.stop_details.category = refusal_category
    msg.model = model
    return msg


def _service() -> ResearchService:
    return ResearchService(api_key="sk-ant-fake", model="claude-opus-5")


def _stream_of(outcome: MagicMock | BaseException) -> MagicMock:
    """One ``beta.messages.stream(...)`` context: yields a stream whose final
    message is ``outcome``, or raises it on entry (how an HTTP error surfaces)."""
    stream = MagicMock()
    stream.get_final_message = AsyncMock(return_value=outcome)
    cm = MagicMock()
    if isinstance(outcome, BaseException):
        cm.__aenter__ = AsyncMock(side_effect=outcome)
    else:
        cm.__aenter__ = AsyncMock(return_value=stream)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def _client(*outcomes: MagicMock | BaseException) -> MagicMock:
    client = MagicMock()
    client.beta.messages.stream = MagicMock(side_effect=[_stream_of(o) for o in outcomes])
    return client


def _patched(*messages: MagicMock):
    """Patch the SDK so successive streamed requests end in ``messages``."""
    client = _client(*messages)
    return patch("anthropic.AsyncAnthropic", return_value=client), client


def _sent(client: MagicMock, call: int = -1) -> dict:
    """The kwargs of one streamed request."""
    return client.beta.messages.stream.call_args_list[call].kwargs


class TestGuards:
    def test_is_configured(self) -> None:
        assert ResearchService(api_key="k", model="m").is_configured() is True
        assert ResearchService().is_configured() is False

    async def test_missing_model_raises_value_error(self) -> None:
        svc = ResearchService(api_key="k")
        with pytest.raises(ValueError):
            await svc.search("sys", "query")

    async def test_missing_key_raises_not_configured(self) -> None:
        svc = ResearchService(model="claude-opus-5")
        with pytest.raises(ExtractionNotConfiguredError):
            await svc.search("sys", "query")

    async def test_both_domain_filters_rejected(self) -> None:
        """The API 400s on both; fail in-process with a clear message."""
        with pytest.raises(ValueError, match="never both"):
            await _service().search(
                "sys",
                "q",
                allowed_domains=["a.com"],
                blocked_domains=["b.com"],
            )


class TestRequestShape:
    async def test_declares_web_search_tool_and_structured_output(self) -> None:
        ctx, client = _patched(_message([_text_block('{"ok": true}')]))
        with ctx:
            await _service().search("sys", "mexican flan", json_schema=SCHEMA, max_searches=4)

        kwargs = _sent(client)
        assert kwargs["tools"] == [
            {"type": "web_search_20260209", "name": "web_search", "max_uses": 4}
        ]
        assert kwargs["output_config"]["format"] == {
            "type": "json_schema",
            "schema": SCHEMA,
        }
        assert kwargs["thinking"] == {"type": "adaptive"}
        # System block cached so the domain prompt keeps hitting cache.
        assert kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}
        assert kwargs["messages"] == [{"role": "user", "content": "mexican flan"}]

    async def test_domain_filter_forwarded(self) -> None:
        ctx, client = _patched(_message([_text_block("{}")]))
        with ctx:
            await _service().search("sys", "q", blocked_domains=["spam.example"])
        assert _sent(client)["tools"][0]["blocked_domains"] == ["spam.example"]

    async def test_read_page_declares_fetch_and_search(self) -> None:
        ctx, client = _patched(_message([_text_block("{}")]))
        with ctx:
            await _service().read_page("sys", "read https://ex.com/flan")

        tools = _sent(client)["tools"]
        assert [t["type"] for t in tools] == [
            "web_fetch_20260209",
            "web_search_20260209",
        ]
        # Citations are incompatible with structured outputs.
        assert tools[0]["citations"] == {"enabled": False}

    async def test_no_schema_omits_format(self) -> None:
        ctx, client = _patched(_message([_text_block("{}")]))
        with ctx:
            await _service().search("sys", "q", effort="low")
        output_config = _sent(client)["output_config"]
        assert output_config == {"effort": "low"}


class TestUsage:
    async def test_prompt_cache_reads_and_writes_count_as_input(self) -> None:
        """``usage.input_tokens`` excludes cached input; the result adds it back and says how much."""
        ctx, _ = _patched(_message([_text_block("{}")], in_tok=50, out_tok=20, cache_read=900, cache_write=300))
        with ctx:
            result = await _service().search("sys", "q")
        assert result.input_tokens == 1250
        assert (result.cache_read_input_tokens, result.cache_creation_input_tokens) == (900, 300)
        assert result.total_tokens == 1270


class TestPauseTurn:
    async def test_resumes_and_merges_both_round_trips(self) -> None:
        """A paused turn is handed back, and both halves fold into one result."""
        first = _message(
            [_server_tool_use_block(), _search_result_block(("https://a.com", "A"))],
            stop_reason="pause_turn",
            in_tok=100,
            out_tok=10,
        )
        second = _message(
            [_search_result_block(("https://b.com", "B")), _text_block('{"ok": true}')],
            in_tok=200,
            out_tok=30,
        )
        ctx, client = _patched(first, second)
        with ctx:
            result = await _service().search("sys", "q")

        assert client.beta.messages.stream.call_count == 2
        assert result.data == {"ok": True}
        assert [s.url for s in result.sources] == ["https://a.com", "https://b.com"]
        # Usage sums across round-trips — one call, one bill.
        assert result.total_tokens == 340
        assert result.server_tool_uses == 1

        # The resume carries the paused assistant content back verbatim.
        resumed = _sent(client, 1)["messages"]
        assert resumed[-1] == {"role": "assistant", "content": first.content}

    async def test_stops_after_resume_cap(self) -> None:
        """A turn that never stops pausing is cut off, not looped forever."""
        always_paused = [
            _message([_text_block('{"ok": true}')], stop_reason="pause_turn")
            for _ in range(20)
        ]
        ctx, client = _patched(*always_paused)
        with ctx:
            result = await _service().search("sys", "q")

        assert client.beta.messages.stream.call_count == 7  # 1 + 6 resumes
        assert result.data == {"ok": True}


class TestSources:
    async def test_deduplicates_across_results(self) -> None:
        msg = _message(
            [
                _search_result_block(("https://a.com", "A"), ("https://b.com", "B")),
                _search_result_block(("https://a.com", "A again")),
                _text_block("{}"),
            ]
        )
        ctx, _ = _patched(msg)
        with ctx:
            result = await _service().search("sys", "q")
        assert [s.url for s in result.sources] == ["https://a.com", "https://b.com"]
        assert result.sources[0].title == "A"

    async def test_server_tool_error_object_degrades_to_no_sources(self) -> None:
        """An error block's ``content`` is an object, not a list — it must not
        blow up the parse. This is the documented server-tool failure shape."""
        msg = _message(
            [_search_error_block("max_uses_exceeded"), _text_block('{"ok": true}')]
        )
        ctx, _ = _patched(msg)
        with ctx:
            result = await _service().search("sys", "q")
        assert result.sources == []
        assert result.data == {"ok": True}

    async def test_fetch_result_source(self) -> None:
        msg = _message(
            [_fetch_result_block("https://ex.com/flan", "Flan"), _text_block("{}")]
        )
        ctx, _ = _patched(msg)
        with ctx:
            result = await _service().read_page("sys", "https://ex.com/flan")
        assert result.sources == [
            WebSource(url="https://ex.com/flan", title="Flan")
        ]


class TestPayloadParsing:
    async def test_uses_last_text_block_not_the_narration(self) -> None:
        """The turn narrates before it answers; the payload is the last word."""
        msg = _message(
            [
                _text_block('I will look for {"not": "the payload"} recipes.'),
                _text_block('{"recipes": [{"title": "Flan"}]}'),
            ]
        )
        ctx, _ = _patched(msg)
        with ctx:
            result = await _service().search("sys", "q")
        assert result.data == {"recipes": [{"title": "Flan"}]}

    async def test_falls_back_to_scanning_fenced_json(self) -> None:
        msg = _message([_text_block('Here you go:\n```json\n{"ok": true}\n```')])
        ctx, _ = _patched(msg)
        with ctx:
            result = await _service().search("sys", "q")
        assert result.data == {"ok": True}

    async def test_no_json_raises_parse_error(self) -> None:
        msg = _message([_text_block("I could not find anything useful.")])
        ctx, _ = _patched(msg)
        with ctx, pytest.raises(ExtractionParseError):
            await _service().search("sys", "q")

    async def test_no_json_is_logged_without_the_reply_text(self, caplog: pytest.LogCaptureFixture) -> None:
        reply = "Jane Doe of Acme was named in the filing, but nothing else."
        ctx, _ = _patched(_message([_text_block(reply)]))
        with ctx, caplog.at_level(logging.ERROR), pytest.raises(ExtractionParseError):
            await _service().search("sys", "q")
        assert "Jane Doe" not in caplog.text
        assert f"chars={len(reply)} stop_reason=end_turn sha256=" in caplog.text


class TestErrorWrapping:
    """Research wraps provider errors; callers never import ``anthropic``."""

    async def test_api_status_error_becomes_extraction_error(self) -> None:
        request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        response = httpx.Response(529, request=request, json={"error": {"type": "overloaded_error"}})
        exc = anthropic.APIStatusError(
            "overloaded", response=response, body={"error": {"type": "overloaded_error"}}
        )
        client = _client(exc)
        with patch("anthropic.AsyncAnthropic", return_value=client):
            with pytest.raises(ExtractionError) as caught:
                await _service().search("sys", "q")

        assert caught.value.status == 529
        assert caught.value.kind is AnthropicFailureKind.UPSTREAM
        assert caught.value.is_transient is True

    async def test_connection_error_becomes_extraction_error(self) -> None:
        request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        exc = anthropic.APIConnectionError(request=request)
        client = _client(exc)
        with patch("anthropic.AsyncAnthropic", return_value=client):
            with pytest.raises(ExtractionError) as caught:
                await _service().search("sys", "q")
        assert caught.value.error_type == "connection_error"
        assert caught.value.is_transient is True


class TestClientReuse:
    async def test_client_built_once(self) -> None:
        ctx, _ = _patched(
            _message([_text_block("{}")]),
            _message([_text_block("{}")]),
        )
        svc = _service()
        with ctx as constructor:
            await svc.search("sys", "one")
            await svc.search("sys", "two")
        assert constructor.call_count == 1


class TestResearch:
    """``research``: both tools, opt-in fallbacks, and the accounting callers store."""

    async def test_declares_both_tools_and_opts_into_fallbacks(self) -> None:
        ctx, client = _patched(_message([_text_block('{"ok": true}')]))
        with ctx:
            await _service().research(
                "sys", "q", json_schema=SCHEMA, max_searches=15, max_fetches=10, fallbacks=True,
            )

        kwargs = _sent(client)
        assert kwargs["tools"] == [
            {"type": "web_search_20260209", "name": "web_search", "max_uses": 15},
            {
                "type": "web_fetch_20260209",
                "name": "web_fetch",
                "max_uses": 10,
                "citations": {"enabled": False},
            },
        ]
        assert not any(t["type"].startswith("code_execution") for t in kwargs["tools"])
        assert kwargs["betas"] == ["server-side-fallback-2026-07-01"]
        assert kwargs["fallbacks"] == "default"
        assert kwargs["output_config"] == {
            "effort": "high",
            "format": {"type": "json_schema", "schema": SCHEMA},
        }

    async def test_search_without_fallbacks_sends_no_beta(self) -> None:
        ctx, client = _patched(_message([_text_block("{}")]))
        with ctx:
            await _service().search("sys", "q")
        assert "betas" not in _sent(client)
        assert "fallbacks" not in _sent(client)

    async def test_counts_billed_searches_and_fetches_across_round_trips(self) -> None:
        first = _message([_server_tool_use_block()], stop_reason="pause_turn", searches=4, fetches=1)
        second = _message([_text_block("{}")], searches=2, fetches=3)
        ctx, _ = _patched(first, second)
        with ctx:
            result = await _service().research(
                "sys", "q", json_schema=SCHEMA, max_searches=15, max_fetches=10,
            )
        assert result.web_search_requests == 6
        assert result.web_fetch_requests == 4

    async def test_collects_server_tool_error_codes(self) -> None:
        msg = _message([
            _search_error_block("max_uses_exceeded"),
            _search_error_block("too_many_requests"),
            _search_result_block(("https://a.com", "A")),
            _text_block("{}"),
        ])
        ctx, _ = _patched(msg)
        with ctx:
            result = await _service().research(
                "sys", "q", json_schema=SCHEMA, max_searches=15, max_fetches=10,
            )
        assert result.tool_error_codes == [
            "web_search_tool_result:max_uses_exceeded",
            "web_search_tool_result:too_many_requests",
        ]
        assert [s.url for s in result.sources] == ["https://a.com"]

    async def test_refusal_raises_with_its_category(self) -> None:
        msg = _message([_text_block("")], stop_reason="refusal", refusal_category="general_harms")
        ctx, _ = _patched(msg)
        with ctx, pytest.raises(ResearchRefusedError) as caught:
            await _service().research(
                "sys", "q", json_schema=SCHEMA, max_searches=15, max_fetches=10, fallbacks=True,
            )
        assert caught.value.category == "general_harms"
        assert caught.value.error_type == "refusal"
        assert caught.value.is_transient is False

    async def test_cut_off_reply_is_never_parsed(self) -> None:
        msg = _message([_text_block('{"ideas": [{"title": "a"}')], stop_reason="max_tokens")
        ctx, _ = _patched(msg)
        with ctx, pytest.raises(ExtractionTruncatedError):
            await _service().research(
                "sys", "q", json_schema=SCHEMA, max_searches=15, max_fetches=10,
            )

    async def test_rate_limit_is_retried_on_the_stream(self) -> None:
        request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        response = httpx.Response(429, request=request, headers={"retry-after": "0"})
        limited = anthropic.RateLimitError(
            "slow down", response=response, body={"error": {"type": "rate_limit_error"}},
        )
        client = _client(limited, _message([_text_block('{"ok": true}')]))
        with patch("anthropic.AsyncAnthropic", return_value=client):
            result = await _service().research(
                "sys", "q", json_schema=SCHEMA, max_searches=15, max_fetches=10,
            )
        assert result.data == {"ok": True}
        assert client.beta.messages.stream.call_count == 2
