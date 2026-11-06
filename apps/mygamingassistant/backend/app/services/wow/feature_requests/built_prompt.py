"""The refiner's user message plus the short-id map for its candidates."""
import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class BuiltPrompt:
    user_message: str
    # "S1" -> story UUID. Claude only ever sees the short ids, so a
    # ``duplicate_of`` it invents (or copies from the visitor's text) can't
    # point at a story that wasn't offered.
    candidate_ids: dict[str, uuid.UUID]
