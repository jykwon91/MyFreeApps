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

import json
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from platform_shared.extraction.backoff import OnRateLimit, create_with_backoff
from platform_shared.extraction.errors import (
    ExtractionNotConfiguredError,
    ExtractionParseError,
)

if TYPE_CHECKING:
    from anthropic.types import Message

logger = logging.getLogger(__name__)

DEFAULT_MAX_TOKENS = 16384


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
    ) -> ExtractionResponse:
        """Extract structured data from a plain-text document."""
        self._require_ready()
        message = await create_with_backoff(
            self._get_client(),
            on_rate_limit=on_rate_limit,
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
    ) -> ExtractionResponse:
        """Extract structured data from an image or PDF document."""
        import base64

        self._require_ready()
        file_b64 = base64.standard_b64encode(file_bytes).decode()

        is_pdf = media_type == "application/pdf"
        source_block: dict = {
            "type": "document" if is_pdf else "image",
            "source": {"type": "base64", "media_type": media_type, "data": file_b64},
        }

        message = await create_with_backoff(
            self._get_client(),
            on_rate_limit=on_rate_limit,
            model=self.model,
            max_tokens=max_tokens,
            system=[{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": [source_block]}],
        )
        return _parse_message(message)


def _parse_message(message: "Message") -> ExtractionResponse:
    """Pull JSON out of the model response. Domain-free.

    Mirrors the pre-extraction parsing exactly: strip a fenced ```json
    block if present, ``json.loads`` the result, attach token usage.
    Parse failure raises ExtractionParseError so the caller can apply a
    domain-specific fallback (the pre-extraction code returned a
    low-confidence placeholder dict here; that policy now lives in the
    MyBookkeeper wrapper).
    """
    try:
        content = message.content[0].text.strip()
        # Extract JSON from markdown code blocks anywhere in the response
        if "```" in content:
            parts = content.split("```")
            for part in parts[1::2]:  # odd-indexed parts are inside code fences
                inner = part.strip()
                if inner.startswith("json"):
                    inner = inner[4:].strip()
                if inner.startswith("{"):
                    content = inner
                    break
        parsed = json.loads(content)
    except (json.JSONDecodeError, IndexError, AttributeError) as e:
        raw_text = message.content[0].text[:500] if message.content else "EMPTY"
        logger.error("Failed to parse extraction response: %s — raw: %s", e, raw_text)
        raise ExtractionParseError(f"Could not parse model response as JSON: {e}") from e

    input_tokens = message.usage.input_tokens
    output_tokens = message.usage.output_tokens
    return ExtractionResponse(
        data=parsed,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        model=message.model,
    )
