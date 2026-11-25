"""The listing and house a new lease will carry, once checked and defaulted."""
from __future__ import annotations

import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class ResolvedLeaseReferences:
    listing_id: uuid.UUID | None
    property_id: uuid.UUID | None
