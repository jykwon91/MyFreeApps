"""Fold every round-trip of one research turn into a ``ResearchResponse``.

Pure: reads SDK message objects by attribute (never imports ``anthropic``),
so the tests can hand it plain mocks.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from platform_shared.core.model_output_log import describe_model_output
from platform_shared.extraction.errors import (
    ExtractionParseError,
    ExtractionTruncatedError,
    ResearchRefusedError,
)
from platform_shared.extraction.json_extract import find_json
from platform_shared.extraction.research_response import ResearchResponse
from platform_shared.extraction.web_source import WebSource

logger = logging.getLogger(__name__)

_RESULT_BLOCK_TYPES = ("web_search_tool_result", "web_fetch_tool_result")


def build_research_response(responses: list[Any]) -> ResearchResponse:
    """Assemble the payload, sources, error codes and usage from every round-trip.

    Raises:
        ResearchRefusedError: the turn ended in ``stop_reason: "refusal"``.
        ExtractionTruncatedError: the turn ran out of ``max_tokens``.
        ExtractionParseError: no JSON payload in the final response.
    """
    if not responses:  # pragma: no cover — the caller always sends at least one
        raise ExtractionParseError("No response received from the model")

    sources: list[WebSource] = []
    seen: set[str] = set()
    texts: list[str] = []
    tool_error_codes: list[str] = []
    tool_uses = 0
    input_tokens = 0
    cache_read_tokens = 0
    cache_write_tokens = 0
    output_tokens = 0
    searches = 0
    fetches = 0

    for message in responses:
        usage = getattr(message, "usage", None)
        input_tokens += _count(getattr(usage, "input_tokens", 0))
        cache_read_tokens += _count(getattr(usage, "cache_read_input_tokens", 0))
        cache_write_tokens += _count(getattr(usage, "cache_creation_input_tokens", 0))
        output_tokens += _count(getattr(usage, "output_tokens", 0))
        server_usage = getattr(usage, "server_tool_use", None)
        searches += _count(getattr(server_usage, "web_search_requests", 0))
        fetches += _count(getattr(server_usage, "web_fetch_requests", 0))

        for block in getattr(message, "content", []) or []:
            block_type = getattr(block, "type", None)
            if block_type == "text":
                text = getattr(block, "text", "") or ""
                if text.strip():
                    texts.append(text)
            elif block_type == "server_tool_use":
                tool_uses += 1
            elif block_type in _RESULT_BLOCK_TYPES:
                error_code = _error_code(block)
                if error_code is not None:
                    tool_error_codes.append(f"{block_type}:{error_code}")
                    continue
                for source in _sources_from_result(block):
                    if source.url not in seen:
                        seen.add(source.url)
                        sources.append(source)

    last = responses[-1]
    stop_reason = getattr(last, "stop_reason", None)
    if stop_reason == "refusal":
        category = getattr(getattr(last, "stop_details", None), "category", None)
        logger.warning("Research turn refused: category=%s", category)
        raise ResearchRefusedError(category if isinstance(category, str) else None)
    if stop_reason == "max_tokens":
        raise ExtractionTruncatedError("Research reply was cut off at max_tokens")

    data = _payload_from_texts(texts, stop_reason=stop_reason)
    # ``usage.input_tokens`` leaves out the prompt-cache reads and writes; add them back so a
    # caller logging usage sees every input token the turn processed.
    input_tokens += cache_read_tokens + cache_write_tokens
    return ResearchResponse(
        data=data,
        sources=sources,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        model=getattr(last, "model", "") or "",
        cache_read_input_tokens=cache_read_tokens,
        cache_creation_input_tokens=cache_write_tokens,
        server_tool_uses=tool_uses,
        web_search_requests=searches,
        web_fetch_requests=fetches,
        tool_error_codes=tool_error_codes,
    )


def _count(value: Any) -> int:
    return value if isinstance(value, int) else 0


def _error_code(block: Any) -> str | None:
    """The server-tool error code, or None for a successful result.

    Server-tool failures do NOT raise: an error arrives as HTTP 200 with the
    result block's ``content`` set to a single error *object* (e.g.
    ``{"error_code": "max_uses_exceeded"}``) where a search success is a
    *list*. A fetch success is also a single object, but without an
    ``error_code``.
    """
    content = getattr(block, "content", None)
    if content is None or isinstance(content, list):
        return None
    error_code = getattr(content, "error_code", None)
    if not isinstance(error_code, str):
        return None
    logger.warning("Server tool %r returned an error: %s", getattr(block, "type", "?"), error_code)
    return error_code


def _sources_from_result(block: Any) -> list[WebSource]:
    """URLs out of one successful server-tool result block."""
    content = getattr(block, "content", None)
    if content is None:
        return []

    # web_fetch success: a single result object carrying the fetched document.
    if not isinstance(content, list):
        url = getattr(content, "url", None)
        return [WebSource(url=url, title=_document_title(content))] if url else []

    # web_search success: a list of result objects.
    out: list[WebSource] = []
    for item in content:
        url = getattr(item, "url", None)
        if url:
            out.append(WebSource(url=url, title=getattr(item, "title", None)))
    return out


def _document_title(content: Any) -> str | None:
    document = getattr(content, "document", None)
    return getattr(document, "title", None) if document is not None else None


def _payload_from_texts(texts: list[str], *, stop_reason: str | None) -> Any:
    """The JSON payload out of the response's text blocks.

    With ``output_config.format`` set the final text block *is* the JSON, so
    the common path is one ``json.loads``. Blocks are tried newest-first
    because a research turn narrates before it answers: the payload is the
    last thing said, and scanning from the front would return a JSON-looking
    fragment out of the commentary.
    """
    for text in reversed(texts):
        stripped = text.strip()
        if not stripped:
            continue
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass
        try:
            return find_json(stripped)
        except json.JSONDecodeError:
            continue

    # Never the text itself, only its shape: a research reply can quote what it read.
    logger.error(
        "Research response carried no JSON payload — %s",
        describe_model_output(texts[-1] if texts else "", stop_reason=stop_reason),
    )
    raise ExtractionParseError("Model response contained no JSON payload")
