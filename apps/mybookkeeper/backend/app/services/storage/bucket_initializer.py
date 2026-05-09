"""Eager bucket setup, called from FastAPI lifespan.

Thin wrapper over ``platform_shared.services.storage.bucket_initializer``.
The shared helper owns the skip-check + ``ensure_bucket`` call + logging
contract; this module wires MBK's ``get_storage`` + skip predicate.

MBK skip condition: requires BOTH ``allow_test_admin_promotion`` AND
``minio_skip_startup_check`` to be true — stricter than MJH's, which
checks only ``minio_skip_startup_check``. The double-flag form is a
test-only escape hatch so production never accidentally skips bucket
verification even if one flag leaks into the env.

Storage is a hard requirement for MBK — listing photos, lease attachments,
and applicant documents all depend on MinIO. If env vars are missing or
MinIO is unreachable at boot, the app MUST refuse to start so the deploy
healthcheck fails and the rollout aborts.

Previous behavior (graceful degradation) hid environmental
misconfiguration as ``presigned_url=null`` in API responses, with no
visible error path — see the postmortem after PRs #201–#204 for the
two-week trail of bugs that pattern caused.
"""
from platform_shared.services.storage.bucket_initializer import (
    ensure_bucket as _shared_ensure_bucket,
)

from app.core.config import settings
from app.core.storage import get_storage


def ensure_bucket() -> None:
    """Ensure the configured MBK bucket exists. Raises on any error.

    Skipped when ``ALLOW_TEST_ADMIN_PROMOTION=true`` AND
    ``MINIO_SKIP_STARTUP_CHECK=true`` are both set in the environment —
    test-only escape hatch.
    """
    _shared_ensure_bucket(
        get_storage=get_storage,
        skip_check=lambda: (
            settings.allow_test_admin_promotion
            and settings.minio_skip_startup_check
        ),
    )
