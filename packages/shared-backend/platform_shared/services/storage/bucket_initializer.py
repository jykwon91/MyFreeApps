"""Eager MinIO bucket setup, called from each app's FastAPI lifespan.

Storage is a hard requirement for any consuming app — listing photos,
lease attachments, applicant documents (MBK) or resume files (MJH) all
depend on MinIO. If env vars are missing or MinIO is unreachable at boot,
the app MUST refuse to start so the deploy healthcheck fails and the
rollout aborts.

Previous behavior (graceful degradation) hid environmental
misconfiguration as ``presigned_url=null`` in API responses, with no
visible error path — see the MBK PR #201–#204 postmortem for the
two-week trail of bugs that pattern caused.

Apps wire this via:

    from platform_shared.services.storage.bucket_initializer import ensure_bucket
    from app.core.config import settings
    from app.core.storage import get_storage

    def app_ensure_bucket() -> None:
        ensure_bucket(
            get_storage=get_storage,
            skip_check=lambda: settings.minio_skip_startup_check,
        )

Each app picks its own skip predicate — MBK requires BOTH
``allow_test_admin_promotion`` AND ``minio_skip_startup_check`` (stricter
escape hatch); MJH requires only ``minio_skip_startup_check``.
"""
from __future__ import annotations

import logging
from collections.abc import Callable

from platform_shared.core.storage import StorageClient, StorageNotConfiguredError

logger = logging.getLogger(__name__)


def ensure_bucket(
    *,
    get_storage: Callable[[], StorageClient],
    skip_check: Callable[[], bool],
) -> None:
    """Ensure the configured bucket exists. Raises on any error.

    The lifespan calls this at startup. If ``get_storage()`` raises
    (env vars missing, etc.) or ``ensure_bucket()`` raises (MinIO
    unreachable), the exception propagates and FastAPI startup fails.
    The deploy healthcheck catches this and rolls back.

    Args:
        get_storage: The app's storage-client builder (e.g.
            ``app.core.storage.get_storage``). Called once per
            invocation; the app is expected to cache.
        skip_check: A callable returning ``True`` when bucket
            verification should be skipped. Apps wire their own
            test-mode escape hatch (e.g. ``lambda: settings.minio_skip_startup_check``).

    Skip path: when ``skip_check()`` returns True, logs a warning and
    returns without contacting MinIO. ``get_storage()`` is not called,
    so missing env vars do NOT crash in skip mode either — useful for
    unit-test suites that don't have MinIO available.

    Raises:
        StorageNotConfiguredError: when env vars are unset.
        Exception: any other error from ``get_storage()`` or
            ``ensure_bucket()`` (network, S3, etc.) propagates so the
            lifespan boot fails.
    """
    if skip_check():
        logger.warning(
            "MinIO startup check skipped (skip_check returned True)",
        )
        return

    try:
        storage = get_storage()
    except StorageNotConfiguredError:
        raise
    storage.ensure_bucket()
    logger.info("MinIO bucket %s ready", storage.bucket)


__all__ = ["ensure_bucket"]
