"""What a verified chat ticket says."""
from dataclasses import dataclass


@dataclass(frozen=True)
class TicketClaims:
    network_hash: str
    expires_at: int
    """Unix seconds."""
    rounds_left: int
    """Tool-result calls still allowed for the current question."""
    digest: str
    """sha256 of the canonical conversation up to and including the reply it came with."""
