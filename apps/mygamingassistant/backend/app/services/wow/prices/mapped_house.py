"""One auction house the price refresh reads: a server's house for one faction."""
from dataclasses import dataclass


@dataclass(frozen=True)
class MappedHouse:
    server: str
    faction: str
    house_id: int

    @property
    def label(self) -> str:
        return f"{self.server}/{self.faction} (house {self.house_id})"
