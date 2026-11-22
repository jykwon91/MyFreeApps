"""Turn the tax advisor's Claude reply into a validated response.

Logs describe the reply by its shape only: the reply discusses the user's
properties and figures, and log lines leave the server as Sentry events.
"""
import json
import logging

from platform_shared.core.model_output_log import describe_model_output
from pydantic import ValidationError

from app.core.tax_advisor_disclaimer import HARDCODED_DISCLAIMER
from app.schemas.tax.tax_advisor import TaxAdvisorResponse, TaxSuggestion

logger = logging.getLogger(__name__)


def parse_advisor_response(raw_response: str) -> TaxAdvisorResponse:
    """Parse Claude's JSON response and validate with Pydantic."""
    content = raw_response
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as e:
        logger.error(
            "Failed to parse tax advisor response: %s — %s",
            e, describe_model_output(raw_response, stop_reason=None),
        )
        return TaxAdvisorResponse(
            suggestions=[
                TaxSuggestion(
                    id="parse_error",
                    category="data_quality",
                    severity="high",
                    title="Unable to analyze tax data",
                    description="I wasn't able to process your tax data this time. This usually means the data is incomplete or in an unexpected format.",
                    action="Try running a recompute first, then request advice again.",
                    confidence="low",
                ),
            ],
            disclaimer=HARDCODED_DISCLAIMER,
        )

    suggestions_raw = parsed.get("suggestions", [])
    suggestions = []
    for index, s in enumerate(suggestions_raw):
        try:
            suggestions.append(TaxSuggestion(**s))
        except (TypeError, ValidationError) as exc:
            logger.warning("Skipping invalid suggestion at index %d (%s)", index, type(exc).__name__)
            continue

    return TaxAdvisorResponse(
        suggestions=suggestions,
        disclaimer=HARDCODED_DISCLAIMER,
    )
