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
* **Same error contract.** Like ``ExtractionService``, provider failures
  are raised as :class:`ExtractionError` carrying ``error_type``/``status``
  and the shared failure ``kind`` (per rules/check-third-party-error-codes.md),
  so callers never import ``anthropic`` to handle them.

Like ``ExtractionService``, ``model`` has no default: the right model is a
per-consumer decision, and a silent shared default would make it invisibly
for every future caller.

Output shape is pinned with **structured outputs**
(``output_config.format``), so the model returns schema-valid JSON rather
than prose the caller has to scrape. Structured outputs combine with the
2026-02-09 ``web_search`` / ``web_fetch`` tools in one request (verified live
on claude-opus-5-5, 2026-11-27); only citations conflict, so ``web_fetch``
declares them off. A text-scanning fallback is kept for the case where a
server-tool turn ends without a structured payload.

Every request is streamed (``client.beta.messages.stream`` →
``get_final_message()``): a research turn can run for minutes, and the beta
surface is what carries ``fallbacks``. A caller passing ``fallbacks=True``
gets Anthropic's server-side fallback (beta ``server-side-fallback-2026-07-01``,
``fallbacks: "default"``), so a policy decline on the requested model is
retried on its default substitute before the turn is reported as a refusal.
A turn that still ends in ``refusal`` raises ``ResearchRefusedError``; one cut
off at ``max_tokens`` raises ``ExtractionTruncatedError``. Parsing lives in
``research_response_parser``.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from platform_shared.extraction.backoff import OnRateLimit, stream_with_backoff
from platform_shared.extraction.errors import (
    ExtractionNotConfiguredError,
    extraction_error_from_anthropic,
)
from platform_shared.extraction.research_response import ResearchResponse
from platform_shared.extraction.research_response_parser import build_research_response
from platform_shared.extraction.web_source import WebSource

__all__ = ["ResearchResponse", "ResearchService", "WebSource", "SERVER_SIDE_FALLBACK_BETA"]

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

SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01"


def _search_tool(
    max_uses: int,
    *,
    allowed_domains: list[str] | None = None,
    blocked_domains: list[str] | None = None,
) -> dict[str, Any]:
    if allowed_domains and blocked_domains:
        raise ValueError(
            "web_search accepts allowed_domains OR blocked_domains, never both"
        )
    tool: dict[str, Any] = {
        "type": _WEB_SEARCH_TYPE,
        "name": "web_search",
        "max_uses": max_uses,
    }
    if allowed_domains:
        tool["allowed_domains"] = allowed_domains
    if blocked_domains:
        tool["blocked_domains"] = blocked_domains
    return tool


def _fetch_tool(max_uses: int) -> dict[str, Any]:
    return {
        "type": _WEB_FETCH_TYPE,
        "name": "web_fetch",
        "max_uses": max_uses,
        # Citations are incompatible with structured outputs (400) and
        # we attribute via `sources` instead.
        "citations": {"enabled": False},
    }


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
                ``error_type``/``status``/``kind``).
            ExtractionParseError: no JSON payload in the final response.
            ResearchRefusedError: the model declined the request.
        """
        tool = _search_tool(
            max_searches,
            allowed_domains=allowed_domains,
            blocked_domains=blocked_domains,
        )
        return await self._run(
            system_prompt,
            user_prompt,
            tools=[tool],
            json_schema=json_schema,
            max_tokens=max_tokens,
            effort=effort,
            fallbacks=False,
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
        return await self._run(
            system_prompt,
            user_prompt,
            tools=[_fetch_tool(max_fetches), _search_tool(max_searches)],
            json_schema=json_schema,
            max_tokens=max_tokens,
            effort=effort,
            fallbacks=False,
            on_rate_limit=on_rate_limit,
        )

    async def research(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        json_schema: dict[str, Any],
        max_searches: int,
        max_fetches: int,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        effort: str = "high",
        fallbacks: bool = False,
        max_wait_seconds: float | None = None,
        on_rate_limit: OnRateLimit | None = None,
    ) -> ResearchResponse:
        """Open-ended research: search the web, read what it finds, answer in JSON.

        Both tools ride along: ``web_search`` finds candidates and
        ``web_fetch`` reads the pages it found (fetch only reaches URLs
        already in the conversation, so it reads search results, never a URL
        the model made up). ``fallbacks`` opts into Anthropic's server-side
        fallback on a policy decline; ``max_wait_seconds`` bounds the
        rate-limit sleep (see ``create_with_backoff``).

        Raises the same errors as ``search``.
        """
        return await self._run(
            system_prompt,
            user_prompt,
            tools=[_search_tool(max_searches), _fetch_tool(max_fetches)],
            json_schema=json_schema,
            max_tokens=max_tokens,
            effort=effort,
            fallbacks=fallbacks,
            max_wait_seconds=max_wait_seconds,
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
        fallbacks: bool,
        on_rate_limit: OnRateLimit | None,
        max_wait_seconds: float | None = None,
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
        if fallbacks:
            request["betas"] = [SERVER_SIDE_FALLBACK_BETA]
            request["fallbacks"] = "default"

        messages: list[dict[str, Any]] = [{"role": "user", "content": user_prompt}]
        responses: list[Any] = []

        for resume in range(_MAX_PAUSE_RESUMES + 1):
            message = await self._send(
                client,
                on_rate_limit=on_rate_limit,
                max_wait_seconds=max_wait_seconds,
                messages=messages,
                **request,
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

        return build_research_response(responses)

    async def _send(
        self,
        client: Any,
        *,
        on_rate_limit: OnRateLimit | None,
        max_wait_seconds: float | None,
        **kwargs: Any,
    ) -> Any:
        """``stream_with_backoff`` with provider errors wrapped as typed ones."""
        import anthropic

        try:
            return await stream_with_backoff(
                client,
                on_rate_limit=on_rate_limit,
                max_wait_seconds=max_wait_seconds,
                **kwargs,
            )
        except anthropic.APIError as exc:
            # Classified so callers route on ``kind`` instead of importing
            # the SDK's exceptions.
            raise extraction_error_from_anthropic(
                exc, log_prefix="web research", logger=logger
            ) from exc
