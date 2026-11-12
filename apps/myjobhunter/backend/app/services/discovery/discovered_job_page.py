"""Result of a paged discovered-jobs listing."""
from __future__ import annotations

from dataclasses import dataclass

from app.models.discovery.discovered_job import DiscoveredJob


@dataclass(frozen=True)
class DiscoveredJobPage:
    rows: list[DiscoveredJob]
    total: int
    scored_count: int | None
    total_count: int | None
