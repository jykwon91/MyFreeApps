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

    # Strategy A grid fields (ingest-time multi-frame path only).
    # is_lineup: did the classifier judge the chapter to be a real tactical-FPS
    #   utility-lineup demo at all? None for the legacy single-image
    #   re-classify path (it cannot make this judgement — see classify_lineup).
    # best_stand_index / best_aim_index: 1-based index into the candidate frame
    #   grid the classifier was shown. None on the single-image path or when
    #   is_lineup is False. The orchestrator uploads these chosen frames.
    is_lineup: Optional[bool] = None
    best_stand_index: Optional[int] = None
    best_aim_index: Optional[int] = None

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

    # Structured, machine-readable classification failures (per
    # rules/check-third-party-error-codes.md: a wrapper that knows WHY it
    # failed must not collapse to bare prose). Each entry is a stable code
    # token suitable for grouping/alerting, e.g.
    #   "unresolved_slug:target_zone:a-short:game=cs2"
    #   "cross_game_rejected:map=mirage:classified=valorant:actual=cs2"
    #   "invalid_confidence:high"
    # These are ALSO mirrored into error_codes so the existing
    # ClassifyResponse.error_codes path surfaces them to the operator/UI
    # without a schema change. reasoning still carries the human prose.
    classification_failures: list[str] = field(default_factory=list)


@dataclass
class ThrowTimingResult:
    """Result of the PR2 throw-localization Claude call.

    Deliberately a SEPARATE type from :class:`ClassificationResult` — the
    throw-timing pass is its own code path (own prompt, own schema, no slug
    resolution, no DB) per the frozen design contract. Conflating them would
    couple two prompts that evolve independently.

    On a successful API call ``success=True`` and ``is_lineup_throw`` reflects
    Claude's judgement (it may be ``False`` — a real "this chapter isn't a
    throw demo" answer, NOT an error). ``error_codes`` is populated only on an
    API/parse failure (per rules/check-third-party-error-codes.md — never a
    bare bool/None).

    ``release_index`` / ``result_index`` are 1-based into the dense frame
    window the call was shown. The parser guarantees
    ``result_index >= release_index`` when both are set (a result cannot
    precede its own release).
    """

    success: bool
    is_lineup_throw: Optional[bool] = None
    release_index: Optional[int] = None
    result_index: Optional[int] = None
    confidence: Optional[float] = None
    reasoning: str = ""
    error_codes: list[str] = field(default_factory=list)
