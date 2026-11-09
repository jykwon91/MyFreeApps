import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class DocumentDeleteResult:
    """Outcome of deleting a set of documents; every requested id lands in exactly one list."""

    deleted: list[uuid.UUID]
    not_found: list[uuid.UUID]
    being_read: list[uuid.UUID]
