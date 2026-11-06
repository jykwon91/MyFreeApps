"""One Claude call that refines a feature request into a verdict + user story.

No DB access here — the caller holds no transaction during the call. Claude is
forced to call ``record_feature_request`` once; the input is re-validated by
``feature_response_mapper``. Anthropic failures are logged with their
documented ``error.type`` (via platform_shared) and raised as typed
``FeatureRequestError`` subclasses so the route answers a specific status.
"""
import logging
from collections.abc import Sequence

import anthropic

from platform_shared.extraction.anthropic_errors import (
    AnthropicFailureKind,
    map_anthropic_status_error,
)

from app.core.config import settings
from app.core.wow_feature_request_limits import REFINER_MAX_TOKENS, REFINER_TIMEOUT_SECONDS
from app.schemas.wow.feature_requests.feature_context import FeatureRequestContext
from app.services.wow.feature_requests.dedupe_candidate import DedupeCandidate
from app.services.wow.feature_requests.feature_prompt_builder import build_refiner_prompt
from app.services.wow.feature_requests.feature_request_errors import (
    FeatureRefinerMisconfiguredError,
    FeatureRefinerRateLimitedError,
    FeatureRefinerUpstreamError,
    FeatureRequestError,
)
from app.services.wow.feature_requests.feature_response_mapper import map_refiner_output
from app.services.wow.feature_requests.feature_tool_schema import FEATURE_TOOL, SYSTEM_PROMPT, TOOL_NAME
from app.services.wow.feature_requests.refinement_result import RefinementResult

logger = logging.getLogger(__name__)

_LOG_PREFIX = "wow feature refiner"

# Shared classification (platform_shared) -> this feature's exception classes.
# A rejected input is an upstream failure here: the visitor can't fix our prompt.
_FAILURE_CLASSES: dict[AnthropicFailureKind, type[FeatureRequestError]] = {
    AnthropicFailureKind.RATE_LIMITED: FeatureRefinerRateLimitedError,
    AnthropicFailureKind.MISCONFIGURED: FeatureRefinerMisconfiguredError,
    AnthropicFailureKind.INPUT_REJECTED: FeatureRefinerUpstreamError,
    AnthropicFailureKind.UPSTREAM: FeatureRefinerUpstreamError,
}


def _build_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(
        api_key=settings.anthropic_api_key, max_retries=1, timeout=REFINER_TIMEOUT_SECONDS
    )


def _map_status_error(exc: anthropic.APIStatusError) -> FeatureRequestError:
    failure = map_anthropic_status_error(exc, log_prefix=_LOG_PREFIX, logger=logger)
    return _FAILURE_CLASSES[failure.kind](str(exc), error_type=failure.error_type)


async def refine_feature_request(
    *,
    raw_text: str,
    clarification_answer: str | None,
    is_follow_up: bool,
    context: FeatureRequestContext | None,
    candidates: Sequence[DedupeCandidate],
) -> RefinementResult:
    prompt = build_refiner_prompt(
        raw_text=raw_text,
        clarification_answer=clarification_answer,
        is_follow_up=is_follow_up,
        context=context,
        candidates=candidates,
    )
    model = settings.claude_feature_refiner_model
    try:
        response = await _build_client().messages.create(
            model=model,
            max_tokens=REFINER_MAX_TOKENS,
            system=SYSTEM_PROMPT,
            tools=[FEATURE_TOOL],
            tool_choice={"type": "tool", "name": TOOL_NAME},
            messages=[{"role": "user", "content": prompt.user_message}],
        )
    except anthropic.APIStatusError as exc:
        raise _map_status_error(exc) from exc
    except anthropic.APIConnectionError as exc:
        # Includes APITimeoutError.
        logger.warning("%s: connection error: %s", _LOG_PREFIX, type(exc).__name__)
        raise FeatureRefinerUpstreamError(
            "Could not reach the AI service", error_type="connection_error"
        ) from exc

    tool_input = next(
        (
            block.input
            for block in response.content
            if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == TOOL_NAME
        ),
        None,
    )
    if not isinstance(tool_input, dict):
        logger.warning(
            "%s: no %s tool call in response (stop_reason=%s)",
            _LOG_PREFIX,
            TOOL_NAME,
            getattr(response, "stop_reason", None),
        )
        raise FeatureRefinerUpstreamError("The AI returned no result", error_type="no_tool_call")
    return map_refiner_output(
        tool_input,
        candidate_ids=prompt.candidate_ids,
        is_follow_up=is_follow_up,
        model_id=str(getattr(response, "model", None) or model),
    )
