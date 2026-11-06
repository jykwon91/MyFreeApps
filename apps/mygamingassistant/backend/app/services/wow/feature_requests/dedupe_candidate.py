"""One existing public story offered to Claude as a possible duplicate."""
import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class DedupeCandidate:
    id: uuid.UUID
    title: str
    i_want: str
    area: str
