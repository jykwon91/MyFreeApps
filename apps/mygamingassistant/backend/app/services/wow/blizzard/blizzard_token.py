"""A client-credentials bearer token and how many seconds Blizzard said it lasts."""
from dataclasses import dataclass


@dataclass(frozen=True)
class BlizzardToken:
    value: str
    expires_in: int
