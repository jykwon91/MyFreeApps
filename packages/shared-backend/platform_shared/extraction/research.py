"""Shared Claude *web research* service.

Sibling of :mod:`platform_shared.extraction.service`. Where that module
extracts structured data from a document the caller already has, this one
answers a question the caller does *not* have the source material for, by
letting Claude drive Anthropic's server-side ``web_search`` / ``web_fetch``
tools and return a JSON payload plus the sources it actually consulted.

Why a separate module rather than more methods on ``ExtractionService``:

* **Different response shape.** A document extraction is one text block.
  A research turn interleaves ``thinking``, ``server_tool_use``,
  ``web_search_tool_result`` / ``web_fetch_tool_result``, and text blocks
  across *several* API round-trips (``stop_reason == "pause_turn"``), and
  the sources are part of the answer — callers want to attribute results.
* **Different error contract.** ``ExtractionService.extract_*`` lets raw
  ``anthropic`` exceptions propagate, because MyBookkeeper's upload worker
  classifies them for its retry policy
  (``apps/mybookkeeper/.../upload_processor_worker.py``). New surface, no
  such consumer — so research wraps provider failures in the typed
  :class:`ExtractionError` with ``error_type``/``status`` attached, per
  rules/check-third-party-error-codes.md, and callers never import
  ``anthropic`` to handle them.

Like ``ExtractionService``, ``model`` has no default: the right model is a
per-consumer decision, and a silent shared default would make it invisibly
for every future caller.

Output shape is pinned with **structured outputs**
(``output_config.format``), so the model returns schema-valid JSON rather
than prose the caller has to scrape. A text-scanning fallback is kept for
the case where a server-tool turn ends without a structured payload.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from platform_shared.extraction.backoff import OnRateLimit, create_with_backoff
from platform_shared.extraction.errors import (
    ExtractionError,
    ExtractionNotConfiguredError,
    ExtractionParseError,
)
from platform_shared.extraction.json_extract import find_json

if TYPE_CHECKING:
    from anthropic.types import Message

logger = logging.getLogger(__name__)

DEFAULT_MAX_TOKENS = 16000

# Server tools run on Anthropic's infrastructure and can hand the turn back
# with ``stop_reason: "pause_turn"`` so the caller can resume a long-running
# search. Each resume is a full API round-trip; this bounds the fan-out of a
# single research call. Six is far more than any observed real turn needs
# (searches themselves are bounded separately by ``max_uses``).
_MAX_PAUSE_RESUMES = 6

# The 2026-02-09 tool variants carry built-in dynamic filtering. They require
# Opus 4.6+ / Sonnet 4.6+; every model this platform pins is newer than that.
# Do NOT additionally declare code_execution alongside them — these tools run
# it under the hood, and a second execution environment confuses the model.
_WEB_SEARCH_TYPE = "web_search_20260209"
_WEB_FETCH_TYPE = "web_fetch_20260209"


@dataclass(frozen=True)
class WebSource:
    """One page the model actually consulted during a research turn."""

    url: str
    title: str | None = None


@dataclass
class ResearchResponse:
    """The parsed model payload, the sources behind it, and token accounting.

    ``data`` is the raw parsed JSON value (schema-valid when the caller
    supplied a ``json_schema``). Interpreting its shape is the caller's job —
    this module stays domain-free.
    """

    data: Any
    sources: list[WebSource]
    input_tokens: int
    output_tokens: int
    total_tokens: int
    model: str
    server_tool_uses: int = 0


@dataclass
class ResearchService:
    """Claude + server-side web tools, returning JSON and its sources."""

    api_key: str = ""
    model: str = ""
    timeout_seconds: float = 600.0
    _client: Any = field(default=None, init=False, repr=False)

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _get_client(self) -> Any:
        # Lazy import + cached client, mirroring ExtractionService: the SDK is
        # only needed by apps that actually call Claude, and one client (one
        # httpx pool) is reused across calls.
        if self._client is None:
            import anthropic

            self._client = anthropic.AsyncAnthropic(
                api_key=self.api_key,
                timeout=anthropic.Timeout(self.timeout_seconds, connect=30.0),
            )
        return self._client

    def _require_ready(self) -> None:
        if not self.model:
            raise ValueError(
                "ResearchService.model must be set (no shared default — each "
                "consumer pins its own model explicitly)"
            )
        if not self.is_configured():
            raise ExtractionNotConfiguredError(
                "ANTHROPIC_API_KEY is not configured — web research is "
                "unavailable. Callers should gate the feature on "
                "is_configured() and return 503 rather than calling in."
            )

    async def search(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        json_schema: dict[str, Any] | None = None,
        max_searches: int = 6,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        effort: str = "medium",
        allowed_domains: list[str] | None = None,
        blocked_domains: list[str] | None = None,
        on_rate_limit: OnRateLimit | None = None,
    ) -> ResearchResponse:
        """Research ``user_prompt`` on the open web and return JSON.

        Args:
            system_prompt: Cached system block — the domain instructions.
            user_prompt: The question / query for this call.
            json_schema: JSON Schema the answer must conform to. Strongly
                recommended: without it the payload is scraped out of prose.
            max_searches: Cap on ``web_search`` invocations (cost ceiling).
            effort: ``low``..``max``. Research is breadth-shaped rather than
                reasoning-shaped, so ``medium`` is the sensible default.
            allowed_domains / blocked_domains: Mutually exclusive result
                filters; passing both is an API error, so callers must pick.

        Raises:
            ExtractionNotConfiguredError: no API key.
            ExtractionError: provider/transport failure (typed, with
                ``error_type``/``status``).
            ExtractionParseError: no JSON payload in the final response.
        """
        if allowed_domains and blocked_domains:
            raise ValueError(
                "web_search accepts allowed_domains OR blocked_domains, never both"
            )

        tool: dict[str, Any] = {
            "type": _WEB_SEARCH_TYPE,
            "name": "web_search",
            "max_uses": max_searches,
        }
        if allowed_domains:
            tool["allowed_domains"] = allowed_domains
        if blocked_domains:
            tool["blocked_domains"] = blocked_domains

        return await self._run(
            system_prompt,
            user_prompt,
            tools=[tool],
            json_schema=json_schema,
            max_tokens=max_tokens,
            effort=effort,
            on_rate_limit=on_rate_limit,
        )

    async def read_page(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        json_schema: dict[str, Any] | None = None,
        max_fetches: int = 3,
        max_searches: int = 2,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        effort: str = "medium",
        on_rate_limit: OnRateLimit | None = None,
    ) -> ResearchResponse:
        """Read specific page(s) named in ``user_prompt`` and return JSON.

        ``web_fetch`` only retrieves URLs already present in the conversation,
        so the caller MUST include the target URL in ``user_prompt`` — that is
        the mechanism, not a convention. A small ``web_search`` budget rides
        along so a page that blocks the fetcher (paywall, bot wall) can still
        be answered from search results instead of failing the request.
        """
        tools: list[dict[str, Any]] = [
            {
                "type": _WEB_FETCH_TYPE,
                "name": "web_fetch",
                "max_uses": max_fetches,
                # Citations are incompatible with structured outputs (400) and
                # we attribute via `sources` instead.
                "citations": {"enabled": False},
            },
            {
                "type": _WEB_SEARCH_TYPE,
                "name": "web_search",
                "max_uses": max_searches,
            },
        ]
        return await self._run(
            system_prompt,
            user_prompt,
            tools=tools,
            json_schema=json_schema,
            max_tokens=max_tokens,
            effort=effort,
            on_rate_limit=on_rate_limit,
        )

    # -- internals ---------------------------------------------------------

    async def _run(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        tools: list[dict[str, Any]],
        json_schema: dict[str, Any] | None,
        max_tokens: int,
        effort: str,
        on_rate_limit: OnRateLimit | None,
    ) -> ResearchResponse:
        """Drive one research turn to completion, resuming on ``pause_turn``."""
        self._require_ready()
        client = self._get_client()

        output_config: dict[str, Any] = {"effort": effort}
        if json_schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": json_schema}

        request: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            # Cached prefix: system block first, volatile query last, so the
            # domain instructions keep hitting cache across calls.
            "system": [
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "tools": tools,
            "output_config": output_config,
            "thinking": {"type": "adaptive"},
        }

        messages: list[dict[str, Any]] = [{"role": "user", "content": user_prompt}]
        responses: list[Message] = []

        for resume in range(_MAX_PAUSE_RESUMES + 1):
            message = await self._create(
                client, on_rate_limit=on_rate_limit, messages=messages, **request
            )
            responses.append(message)
            if getattr(message, "stop_reason", None) != "pause_turn":
                break
            # Hand the partial turn back so the server resumes where it
            # paused. Append the full content — dropping the server-tool
            # blocks would restart the search from scratch.
            messages = [
                *messages,
                {"role": "assistant", "content": message.content},
            ]
            logger.info(
                "Research turn paused (resume %d/%d) — continuing",
                resume + 1,
                _MAX_PAUSE_RESUMES,
            )
        else:
            logger.warning(
                "Research turn still paused after %d resumes — using what we have",
                _MAX_PAUSE_RESUMES,
            )

        return _build_response(responses)

    async def _create(
        self,
        client: Any,
        *,
        on_rate_limit: OnRateLimit | None,
        **kwargs: Any,
    ) -> "Message":
        """``create_with_backoff`` with provider errors wrapped as typed ones."""
        import anthropic

        try:
            return await create_with_backoff(
                client, on_rate_limit=on_rate_limit, **kwargs
            )
        except anthropic.APIStatusError as exc:
            # backoff.py already logged type+status; wrap so callers handle a
            # platform error type instead of importing the SDK's exceptions.
            raise ExtractionError(
                f"Anthropic API error during web research: {exc}",
                error_type=getattr(exc, "type", None),
                status=getattr(exc, "status_code", None),
            ) from exc
        except anthropic.APIError as exc:
            # Connection/timeout errors carry no status.
            logger.warning("Anthropic transport error during web research: %s", exc)
            raise ExtractionError(
                f"Could not reach the Anthropic API: {exc}",
                error_type=type(exc).__name__,
            ) from exc


def _build_response(responses: list["Message"]) -> ResearchResponse:
    """Assemble the payload, sources, and usage from every round-trip."""
    if not responses:  # pragma: no cover — the loop always appends at least one
        raise ExtractionParseError("No response received from the model")

    sources: list[WebSource] = []
    seen: set[str] = set()
    texts: list[str] = []
    tool_uses = 0
    input_tokens = 0
    output_tokens = 0

    for message in responses:
        usage = getattr(message, "usage", None)
        input_tokens += getattr(usage, "input_tokens", 0) or 0
        output_tokens += getattr(usage, "output_tokens", 0) or 0

        for block in getattr(message, "content", []) or []:
            block_type = getattr(block, "type", None)
            if block_type == "text":
                text = getattr(block, "text", "") or ""
                if text.strip():
                    texts.append(text)
            elif block_type == "server_tool_use":
                tool_uses += 1
            elif block_type in ("web_search_tool_result", "web_fetch_tool_result"):
                for source in _sources_from_result(block):
                    if source.url not in seen:
                        seen.add(source.url)
                        sources.append(source)

    data = _payload_from_texts(texts)
    return ResearchResponse(
        data=data,
        sources=sources,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        model=getattr(responses[-1], "model", ""),
        server_tool_uses=tool_uses,
    )


def _sources_from_result(block: Any) -> list[WebSource]:
    """URLs out of one server-tool result block.

    Server-tool failures do NOT raise: an error arrives as HTTP 200 with the
    result block's ``content`` set to a single error *object* (e.g.
    ``{"error_code": "max_uses_exceeded"}``) where a success is a *list*.
    Branch on that before iterating, or a failed search raises TypeError deep
    in the parse instead of degrading to "no sources".
    """
    content = getattr(block, "content", None)

    if content is None:
        return []

    # web_fetch success: a single result object carrying the fetched document.
    if not isinstance(content, list):
        error_code = getattr(content, "error_code", None)
        if error_code is not None:
            logger.warning(
                "Server tool %r returned an error: %s",
                getattr(block, "type", "?"),
                error_code,
            )
            return []
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


def _payload_from_texts(texts: list[str]) -> Any:
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

    preview = (texts[-1][:500] if texts else "EMPTY").replace("\n", " ")
    logger.error("Research response carried no JSON payload — raw: %s", preview)
    raise ExtractionParseError("Model response contained no JSON payload")
