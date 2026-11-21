"""What the tax advisor tells the user when its Claude call fails.

Our own copy, chosen by the shared failure kind: the provider's error text
never reaches the response.
"""
from __future__ import annotations

TAX_ADVISOR_BUSY_MESSAGE = "The AI service is busy right now. Try again in a minute."
TAX_ADVISOR_UNAVAILABLE_MESSAGE = "Tax advice isn't available right now. Try again later."
TAX_ADVISOR_INPUT_REJECTED_MESSAGE = "The AI service couldn't process this return's data."

# The HTTP status for any Claude failure; 429 stays reserved for the daily advice limit.
TAX_ADVISOR_AI_FAILURE_STATUS = 502
# Sent as Retry-After when the failure clears on its own.
TAX_ADVISOR_RETRY_AFTER_SECONDS = 60
