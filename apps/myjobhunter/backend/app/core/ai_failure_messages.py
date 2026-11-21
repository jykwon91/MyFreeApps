"""What MyJobHunter tells the user when a Claude call fails.

Our own copy, chosen by the shared failure kind — the provider's error text
(``Error code: 429 - {'type': 'error', ...}``) is never shown to a user or
stored where the UI reads it.
"""
from __future__ import annotations

AI_BUSY_MESSAGE = "The AI service is busy right now. Try again in a minute."
AI_UNAVAILABLE_MESSAGE = "The AI service isn't available right now. Try again later."
AI_INPUT_REJECTED_MESSAGE = "The AI service couldn't process this text. Try shortening or editing it."
AI_UNREADABLE_REPLY_MESSAGE = "The AI's answer couldn't be read. Try again."

# Sent as Retry-After when the failure clears on its own.
AI_RETRY_AFTER_SECONDS = 60

# Stored on a background job that will be retried automatically.
AI_RETRY_SCHEDULED_MESSAGE = "The AI service is busy. We'll try again automatically in a few minutes."
