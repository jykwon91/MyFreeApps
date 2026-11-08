"""Weighted tokens reserved for one Claude call, against both daily buckets."""
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class TokenReservation:
    day: date
    """The UTC day reserved against — the release goes to the same day's rows."""
    amount: int
    ip_bucket: str
