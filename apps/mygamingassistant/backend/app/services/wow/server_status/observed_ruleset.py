"""One ruleset's status as Blizzard reported it on one check."""
from dataclasses import dataclass


@dataclass(frozen=True)
class ObservedRuleset:
    slug: str
    # STATUS_UP or STATUS_DOWN (app/core/wow_server_status.py).
    status: str
