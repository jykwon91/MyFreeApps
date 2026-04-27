"""Result of running BounceDetector on an inbound email."""

from dataclasses import dataclass
from typing import Literal

BounceReason = Literal[
    "from_address",
    "subject",
    "header_x_failed_recipients",
    "header_auto_submitted",
    "header_dsn",
    "body_dsn_fingerprint",
]


@dataclass(frozen=True, slots=True)
class BounceDetectionResult:
    """Outcome of bounce detection.

    Always carries a `reason` when `filtered` is True so audit logs capture
    *why* an email was filtered.
    """
    filtered: bool
    reason: BounceReason | None = None
