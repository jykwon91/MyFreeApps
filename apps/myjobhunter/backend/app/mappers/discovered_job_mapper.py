"""DiscoveredJob ORM rows → ``DiscoveredJobResponse``."""
from __future__ import annotations

import uuid

from app.models.discovery.discovered_job import DiscoveredJob
from app.schemas.discovery.discovery_schemas import DiscoveredJobResponse


def to_discovered_job_response(
    job: DiscoveredJob, discovery_source_id: uuid.UUID | None,
) -> DiscoveredJobResponse:
    """The response for ``job``; ``discovery_source_id`` comes from its fetch row
    (``discovery_repository.list_discovered``), not from the job itself."""
    return DiscoveredJobResponse.model_validate(job).model_copy(
        update={"discovery_source_id": discovery_source_id},
    )
