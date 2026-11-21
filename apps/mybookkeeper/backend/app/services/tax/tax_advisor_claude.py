"""The tax advisor's Claude call.

An Anthropic SDK failure leaves as the shared ``ExtractionError``, whose
``kind`` (rate limited, upstream, misconfigured, input rejected) the route
answers on with our own copy.
"""
from __future__ import annotations

import logging

import anthropic
from platform_shared.extraction import extraction_error_from_anthropic

from app.services.extraction.claude_service import _create_with_backoff
from app.services.extraction.prompts.tax_advisor_prompt import TAX_ADVISOR_PROMPT

logger = logging.getLogger(__name__)


async def ask_tax_advisor(*, model: str, tax_data_json: str) -> anthropic.types.Message:
    """Send the serialized tax data to Claude and return the raw Message."""
    try:
        return await _create_with_backoff(
            model=model,
            max_tokens=8192,
            system=[{
                "type": "text",
                "text": TAX_ADVISOR_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{
                "role": "user",
                "content": f"Analyze this tax data and return suggestions:\n\n{tax_data_json}",
            }],
        )
    except anthropic.APIError as exc:
        raise extraction_error_from_anthropic(exc, log_prefix="Tax advisor", logger=logger) from exc
