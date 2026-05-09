"""Eager bucket setup, called from FastAPI lifespan.

Thin wrapper over ``platform_shared.services.storage.bucket_initializer``.
The shared helper owns the skip-check + ``ensure_bucket`` call + logging
contract; this module wires MJH's ``get_storage`` + skip predicate.

MJH skip condition: ``minio_skip_startup_check`` alone — looser than MBK's
which also requires ``allow_test_admin_promotion``. MJH doesn't have an
admin-promotion test escape hatch so the single flag is enough.

Storage is a hard requirement for MJH — resume files all depend on MinIO.
If env vars are missing or MinIO is unreachable at boot, the app MUST refuse
to start so the deploy healthcheck fails and the rollout aborts.
"""
from platform_shared.services.storage.bucket_initializer import (
    ensure_bucket as _shared_ensure_bucket,
)

from app.core.config import settings
from app.core.storage import get_storage


def ensure_bucket() -> None:
    """Ensure the configured MJH bucket exists. Raises on any error.

    Skipped when ``MINIO_SKIP_STARTUP_CHECK=true`` is set — test-only
    escape hatch so unit-test suites without local MinIO can boot.
    """
    _shared_ensure_bucket(
        get_storage=get_storage,
        skip_check=lambda: settings.minio_skip_startup_check,
    )
