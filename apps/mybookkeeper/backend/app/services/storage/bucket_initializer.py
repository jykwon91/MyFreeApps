"""Eager bucket setup, called from FastAPI lifespan.

Storage is a hard requirement for this app — listing photos, lease
attachments, and applicant documents all depend on MinIO. If env vars
are missing or MinIO is unreachable at boot, the app MUST refuse to
start so the deploy healthcheck fails and the rollout aborts.

Previous behavior (graceful degradation) hid environmental
misconfiguration as `presigned_url=null` in API responses, with no
visible error path — see the postmortem after PRs #201–#204 for the
two-week trail of bugs that pattern caused.
"""
from __future__ import annotations

import logging

from app.core.storage import get_storage

logger = logging.getLogger(__name__)


def ensure_bucket() -> None:
    """Ensure the configured bucket exists. Raises on any error.

    The lifespan calls this at startup. If `get_storage()` raises (env
    vars missing, etc.) or `bucket_exists()` raises (MinIO unreachable),
    the exception propagates and FastAPI startup fails. The deploy
    healthcheck catches this and rolls back.
    """
    storage = get_storage()
    storage.ensure_bucket()
    logger.info("MinIO bucket %s ready", storage.bucket)
