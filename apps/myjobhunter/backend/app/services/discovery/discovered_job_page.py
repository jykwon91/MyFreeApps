"""Result of a paged discovered-jobs listing."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.models.discovery.discovered_job import DiscoveredJob


@dataclass(frozen=True)
class DiscoveredJobPage:
    # Each job with the id of the saved search that fetched it.
    rows: list[tuple[DiscoveredJob, uuid.UUID | None]]
    total: int
    scored_count: int | None
    total_count: int | None
