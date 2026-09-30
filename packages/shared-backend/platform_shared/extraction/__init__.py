"""Shared Claude extraction primitives.

- ``ExtractionService`` / ``ExtractionResponse`` — the consumer-facing
  text/document extraction API.
- ``create_with_backoff`` / ``ThrottleState`` / ``throttle`` /
  ``RateLimitEvent`` — the lower-level Anthropic-call primitive, reused
  directly by callers that make non-extraction Claude calls (e.g.
  MyBookkeeper's tax advisor) and that need the same shared throttle.
- ``ResearchService`` / ``ResearchResponse`` / ``WebSource`` — the
  web-research API (Claude + server-side web_search / web_fetch),
  returning a JSON payload plus the sources behind it.
- ``find_json`` — pull the JSON payload out of a text response.
- ``ExtractionNotConfiguredError`` / ``ExtractionError`` /
  ``ExtractionParseError`` — typed errors.
- ``map_anthropic_status_error`` / ``map_anthropic_connection_error`` /
  ``AnthropicFailure`` / ``AnthropicFailureKind`` — classify a raw SDK
  failure (and log its documented ``error.type``) for callers that call
  the SDK directly (MGA item reader, MyLanguageTutor).
"""
from platform_shared.extraction.anthropic_errors import (
    AnthropicFailure,
    AnthropicFailureKind,
    map_anthropic_connection_error,
    map_anthropic_status_error,
)
from platform_shared.extraction.backoff import (
    RateLimitEvent,
    ThrottleState,
    create_with_backoff,
    throttle,
)
from platform_shared.extraction.errors import (
    ExtractionError,
    ExtractionNotConfiguredError,
    ExtractionParseError,
)
from platform_shared.extraction.json_extract import find_json
from platform_shared.extraction.research import (
    ResearchResponse,
    ResearchService,
    WebSource,
)
from platform_shared.extraction.service import ExtractionResponse, ExtractionService

__all__ = [
    "ExtractionService",
    "ExtractionResponse",
    "ResearchService",
    "ResearchResponse",
    "WebSource",
    "find_json",
    "create_with_backoff",
    "ThrottleState",
    "throttle",
    "RateLimitEvent",
    "ExtractionError",
    "ExtractionNotConfiguredError",
    "ExtractionParseError",
    "AnthropicFailure",
    "AnthropicFailureKind",
    "map_anthropic_status_error",
    "map_anthropic_connection_error",
]
