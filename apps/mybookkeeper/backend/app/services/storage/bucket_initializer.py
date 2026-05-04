"""Eager bucket setup, called from FastAPI lifespan.

Storage is a hard requirement for this app — listing photos, lease
attachments, and applicant documents all depend on MinIO. If env vars
are missing or MinIO is unreachable at boot, the app MUST refuse to
start so the deploy healthcheck fails and the rollout aborts.

Previous behavior (graceful degradation) hid environmental
misconfiguration as `presigned_url=null` in API responses, with no
visible error path — see the postmortem after PRs #201–#204 for the
two-week trail of bugs that pattern caused.

Exception: when ``allow_test_admin_promotion=true`` AND
``minio_skip_startup_check=true`` both appear in the environment the
bucket check is skipped so E2E test suites can run against a backend
that has no local MinIO. Storage is still mocked at the route level via
``POST /test/mock-gmail-send/enable`` for any test that exercises the
receipt-send path.
"""
from __future__ import annotations

import logging

from app.core.config import settings
from app.core.storage import StorageNotConfiguredError, get_storage

logger = logging.getLogger(__name__)


def ensure_bucket() -> None:
    """Ensure the configured bucket exists. Raises on any error.

    The lifespan calls this at startup. If `get_storage()` raises (env
    vars missing, etc.) or `bucket_exists()` raises (MinIO unreachable),
    the exception propagates and FastAPI startup fails. The deploy
    healthcheck catches this and rolls back.

    The check is intentionally skipped when both
    ``ALLOW_TEST_ADMIN_PROMOTION=true`` and
    ``MINIO_SKIP_STARTUP_CHECK=true`` are set — test-only escape hatch.
    """
    if settings.allow_test_admin_promotion and settings.minio_skip_startup_check:
        logger.warning(
            "MinIO startup check skipped (MINIO_SKIP_STARTUP_CHECK=true in test mode)"
        )
        return

    try:
        storage = get_storage()
    except StorageNotConfiguredError:
        raise
    storage.ensure_bucket()
    logger.info("MinIO bucket %s ready", storage.bucket)
