"""ClassificationResult — structured output from the Claude lineup classifier.

Callers inspect success first; on failure, error_codes carries the Claude API
error type(s) so callers can route (rate-limit vs config error vs transient).

Per rules/check-third-party-error-codes.md: never return bare bool; always
surface error types so callers and Sentry dashboards can diagnose failures.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ClassificationResult:
    """Result of a single lineup classification call.

    On success:
      success=True, suggested_* fields populated, error_codes=[]

    On failure:
      success=False, suggested_* fields None, error_codes contains the
      Anthropic API error type string(s) (e.g. 'rate_limit_error',
      'api_error', 'invalid_request_error').
    """

    success: bool

    # Suggested classification — may be None if classifier could not determine
    # the field confidently (slug failed to resolve → FK stays null).
    suggested_game_id: Optional[uuid.UUID] = None
    suggested_map_id: Optional[uuid.UUID] = None
    suggested_target_zone_id: Optional[uuid.UUID] = None
    suggested_stand_zone_id: Optional[uuid.UUID] = None
    suggested_side: Optional[str] = None
    suggested_utility_type_id: Optional[uuid.UUID] = None
    aim_anchor_x: Optional[float] = None
    aim_anchor_y: Optional[float] = None
    confidence: Optional[float] = None

    # Human-readable reasoning from the model; includes slug-resolution failures.
    reasoning: str = ""

    # Anthropic API error types on failure (empty list on success).
    # Populated from anthropic.APIError / APIStatusError.type field.
    # Used by callers to distinguish rate limits from config errors.
    error_codes: list[str] = field(default_factory=list)
