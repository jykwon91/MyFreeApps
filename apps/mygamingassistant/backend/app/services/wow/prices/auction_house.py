"""One auction house from Blizzard's index and the faction its name says it serves."""
from dataclasses import dataclass


@dataclass(frozen=True)
class AuctionHouse:
    id: int
    faction: str
