"""Cost-weighted usage units -- pure math, no I/O.

1 unit = the price of one uncached claude-haiku-4-5 input token. See the
"Daily cost caps" block in ``app/core/config.py`` for the budget derivation.

    units = weight x (uncached_in + 0.1 x cache_read + 1.25 x cache_write + 5 x output)

``weight`` is the model's price relative to Haiku 4.5 (settings). Every
result is rounded UP so the ledger never under-counts spend.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol

CACHE_READ_MULTIPLIER = 0.1
CACHE_WRITE_MULTIPLIER = 1.25
OUTPUT_MULTIPLIER = 5.0

# Reservation estimate: characters per token assumed when sizing a prompt that
# has not been sent yet. Deliberately pessimistic (English / Spanish run about
# 3.5-4 chars per token) so the reserve is an upper bound.
CHARS_PER_TOKEN_ESTIMATE = 2.5
# Fixed per-request overhead (role markers, schema, formatting) in tokens.
REQUEST_OVERHEAD_TOKENS = 200


class UsageLike(Protocol):
    """The fields read from ``anthropic.types.Usage``."""

    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int | None
    cache_creation_input_tokens: int | None


@dataclass(frozen=True)
class CallUsage:
    """Token counts for one Claude call (or the sum of several)."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    @classmethod
    def from_api(cls, usage: UsageLike | None) -> "CallUsage":
        if usage is None:
            return cls()
        return cls(
            input_tokens=int(usage.input_tokens or 0),
            output_tokens=int(usage.output_tokens or 0),
            cache_read_tokens=int(usage.cache_read_input_tokens or 0),
            cache_write_tokens=int(usage.cache_creation_input_tokens or 0),
        )

    def __add__(self, other: "CallUsage") -> "CallUsage":
        return CallUsage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            cache_read_tokens=self.cache_read_tokens + other.cache_read_tokens,
            cache_write_tokens=self.cache_write_tokens + other.cache_write_tokens,
        )


def units_for(usage: CallUsage, *, weight: float) -> int:
    """Cost units actually spent by one call."""
    raw = (
        usage.input_tokens
        + CACHE_READ_MULTIPLIER * usage.cache_read_tokens
        + CACHE_WRITE_MULTIPLIER * usage.cache_write_tokens
        + OUTPUT_MULTIPLIER * usage.output_tokens
    )
    return math.ceil(weight * raw)


def estimate_input_tokens(prompt_chars: int) -> int:
    """Upper-bound token estimate for a prompt of ``prompt_chars`` characters."""
    return math.ceil(prompt_chars / CHARS_PER_TOKEN_ESTIMATE) + REQUEST_OVERHEAD_TOKENS


def reservation_units(*, input_tokens_est: int, max_tokens: int, weight: float) -> int:
    """Worst-case units for one call: every input token is a cache WRITE
    (the most expensive input kind) and the output hits ``max_tokens``."""
    return math.ceil(
        weight
        * (CACHE_WRITE_MULTIPLIER * input_tokens_est + OUTPUT_MULTIPLIER * max_tokens)
    )
