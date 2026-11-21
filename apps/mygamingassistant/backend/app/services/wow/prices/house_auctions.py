"""One house's answer: its auction rows, read as they arrive, and when Blizzard took the snapshot."""
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class HouseAuctions:
    # Consumed once, inside the ``async with`` that opened it; never a materialised list.
    auctions: AsyncIterator[dict[str, Any]]
    # The response's Last-Modified; None when Blizzard didn't send one.
    snapshot_at: datetime | None
