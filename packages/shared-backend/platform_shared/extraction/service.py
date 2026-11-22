"""Shared Claude extraction service.

Wraps an Anthropic ``messages.create`` call for the
text-and-document-extraction use case: ephemeral-cached system prompt,
shared throttle + 429 backoff, JSON-from-response parsing with token
accounting. The caller supplies the system prompt and interprets the
parsed JSON — this module is domain-free so MyBookkeeper (invoices,
tax) and MyPizzaTracker (receipts) both consume it without either
leaking into the other.

Shape mirrors ``platform_shared.services.sms_service.SmsService``: a
dataclass with ``is_configured()``, a typed "not configured" error
backed by a boot guard, and a lazy SDK import so apps that never call
Claude don't need ``anthropic`` installed.

``model`` has no default on purpose. The Anthropic SDK default in
jkwon-claude-config's claude-api skill is ``claude-opus-4-7``, but the
right model is a per-consumer decision (MyBookkeeper pins
``claude-sonnet-4-6`` to keep extraction output AND its production
prompt cache byte-stable). A silent shared default would make that
decision invisibly for every future consumer — so each caller states
its model explicitly.

Prompt caching: the system block is emitted as a single text block with
``cache_control: {"type": "ephemeral"}`` — byte-identical to the
pre-extraction MyBookkeeper call. Caching is a prefix match, so as long
as the caller passes the same system prompt and the same model, the
existing production cache entry continues to hit across this extraction.
"""
from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from platform_shared.core.model_output_log import describe_model_output
from platform_shared.extraction.backoff import OnRateLimit, create_with_backoff
from platform_shared.extraction.errors import (
    ExtractionNotConfiguredError,
    ExtractionParseError,
    ExtractionTruncatedError,
    extraction_error_from_anthropic,
)
from platform_shared.extraction.json_extract import find_json

if TYPE_CHECKING:
    from anthropic.types import Message

logger = logging.getLogger(__name__)

DEFAULT_MAX_TOKENS = 16384
_LOG_PREFIX = "extraction"


@dataclass
class ExtractionResponse:
    """The parsed model response plus token accounting.

    ``data`` is the raw parsed JSON value the model returned (typically a
    dict). The caller owns interpreting its shape — this service does not
    unwrap domain-specific keys.
    """

    data: Any
    input_tokens: int
    output_tokens: int
    total_tokens: int
    model: str


@dataclass
class ExtractionService:
    api_key: str = ""
    model: str = ""
    timeout_seconds: float = 600.0
    _client: Any = field(default=None, init=False, repr=False)

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _get_client(self) -> Any:
        # Lazy import + cached client: the anthropic SDK is only needed
        # by apps that actually extract, and one client (one httpx pool)
        # is reused across calls — the pre-extraction behaviour.
        if self._client is None:
            import anthropic

            self._client = anthropic.AsyncAnthropic(
                api_key=self.api_key,
                timeout=anthropic.Timeout(self.timeout_seconds, connect=30.0),
            )
        return self._client

    def _client_for(self, max_retries: int | None) -> Any:
        client = self._get_client()
        if max_retries is None:
            return client
        # A copy with its own retry setting that shares the httpx pool.
        return client.with_options(max_retries=max_retries)

    def _require_ready(self) -> None:
        if not self.model:
            raise ValueError(
                "ExtractionService.model must be set (no shared default — "
                "each consumer pins its own model explicitly)"
            )
        if not self.is_configured():
            raise ExtractionNotConfiguredError(
                "ANTHROPIC_API_KEY is not configured. The "
                "platform_shared.core.boot_guards.check_extraction_configured() "
                "guard should have caught this at lifespan startup — "
                "investigate why the runtime ExtractionService has an empty "
                "api_key."
            )

    async def extract_text(
        self,
        system_prompt: str,
        text: str,
        *,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        on_rate_limit: OnRateLimit | None = None,
        max_wait_seconds: float | None = None,
        max_retries: int | None = None,
    ) -> ExtractionResponse:
        """Extract structured data from a plain-text document.

        ``max_wait_seconds`` bounds the throttle and 429 backoff sleeps (see
        ``create_with_backoff``); ``None`` keeps the unbounded default.
        ``max_retries`` overrides the SDK's own retries (2 by default, each
        after a sleep) for this call; ``None`` keeps the SDK default. A caller
        with its own retry schedule passes 0 so one call is one request.

        Raises:
            ExtractionError: the Anthropic call failed; ``kind`` / ``is_transient``
                say whether to retry.
            ExtractionParseError: the reply was not JSON
                (ExtractionTruncatedError: it was cut off at ``max_tokens``).
        """
        self._require_ready()
        message = await self._create(
            max_retries=max_retries,
            on_rate_limit=on_rate_limit,
            max_wait_seconds=max_wait_seconds,
            model=self.model,
            max_tokens=max_tokens,
            system=[{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": f"Document:\n{text}"}],
        )
        return _parse_message(message)

    async def extract_document(
        self,
        system_prompt: str,
        file_bytes: bytes,
        media_type: str,
        *,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        on_rate_limit: OnRateLimit | None = None,
        max_wait_seconds: float | None = None,
        max_retries: int | None = None,
    ) -> ExtractionResponse:
        """Extract structured data from an image or PDF document.

        ``max_wait_seconds`` and ``max_retries``: as for ``extract_text``.
        """
        self._require_ready()
        file_b64 = base64.standard_b64encode(file_bytes).decode()

        is_pdf = media_type == "application/pdf"
        source_block: dict = {
            "type": "document" if is_pdf else "image",
            "source": {"type": "base64", "media_type": media_type, "data": file_b64},
        }

        message = await self._create(
            max_retries=max_retries,
            on_rate_limit=on_rate_limit,
            max_wait_seconds=max_wait_seconds,
            model=self.model,
            max_tokens=max_tokens,
            system=[{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": [source_block]}],
        )
        return _parse_message(message)

    async def _create(
        self,
        *,
        on_rate_limit: OnRateLimit | None,
        max_wait_seconds: float | None,
        max_retries: int | None,
        **kwargs: Any,
    ) -> "Message":
        """``create_with_backoff`` with every SDK error raised as a classified ``ExtractionError``."""
        import anthropic

        try:
            return await create_with_backoff(
                self._client_for(max_retries),
                on_rate_limit=on_rate_limit,
                max_wait_seconds=max_wait_seconds,
                **kwargs,
            )
        except anthropic.APIError as exc:
            raise extraction_error_from_anthropic(
                exc, log_prefix=_LOG_PREFIX, logger=logger
            ) from exc


def _parse_message(message: "Message") -> ExtractionResponse:
    """Pull JSON out of the model response. Domain-free.

    A reply cut off at ``max_tokens`` raises ExtractionTruncatedError
    without being parsed, and an unparseable one raises
    ExtractionParseError, so the caller decides what a failed read means
    for its domain. The reply's text is every text block joined, so a
    non-text first block (e.g. a tool or thinking block) can't hide it.
    """
    input_tokens = message.usage.input_tokens
    output_tokens = message.usage.output_tokens
    text = "".join(block.text for block in message.content if block.type == "text")

    if message.stop_reason == "max_tokens":
        logger.error(
            "Extraction response cut off at max_tokens: model=%s input_tokens=%d output_tokens=%d",
            message.model, input_tokens, output_tokens,
        )
        raise ExtractionTruncatedError(
            f"Model response was cut off at max_tokens after {output_tokens} output tokens",
            error_type="max_tokens",
        )

    try:
        parsed = find_json(text)
    except json.JSONDecodeError as e:
        logger.error(
            "Failed to parse extraction response: %s — model=%s input_tokens=%d output_tokens=%d %s",
            e, message.model, input_tokens, output_tokens,
            # Never the text itself: it is what the model read off the document.
            describe_model_output(text, stop_reason=message.stop_reason),
        )
        raise ExtractionParseError(f"Could not parse model response as JSON: {e}") from e

    return ExtractionResponse(
        data=parsed,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        model=message.model,
    )

