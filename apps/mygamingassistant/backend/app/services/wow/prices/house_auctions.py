"""One house's answer: its auction rows and when Blizzard took the snapshot."""
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class HouseAuctions:
    auctions: list[dict[str, Any]]
    # The response's Last-Modified; None when Blizzard didn't send one.
    snapshot_at: datetime | None
