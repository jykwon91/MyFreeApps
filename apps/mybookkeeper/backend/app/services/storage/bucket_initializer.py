"""Idempotent bucket setup, called from FastAPI lifespan.

The MinIO container starts fresh on first deploy, and Docker volumes survive
restarts but not destroy/recreate cycles. Calling this on every backend boot
ensures the bucket exists without any hand-coded provisioning step.

When MinIO is not configured or unreachable, this function logs a warning
and returns — the backend must keep starting. Callers that actually need
storage (photo upload) handle the missing-storage case separately.
"""
from __future__ import annotations

import logging

from app.core.storage import get_storage

logger = logging.getLogger(__name__)


def ensure_bucket() -> None:
    """Ensure the configured bucket exists. Safe to call repeatedly.

    Returns silently on every error path so a misconfigured or temporarily
    unavailable MinIO never blocks app startup. Storage-dependent endpoints
    (photo upload) surface the misconfiguration to the caller as a 503.
    """
    try:
        storage = get_storage()
    except Exception:  # noqa: BLE001 — startup must be defensive
        logger.warning(
            "Storage initialization raised; bucket setup skipped",
            exc_info=True,
        )
        return

    if storage is None:
        logger.info(
            "MinIO not configured — skipping bucket initialization. "
            "Set minio_endpoint/access_key/secret_key to enable.",
        )
        return

    try:
        storage.ensure_bucket()
        logger.info("MinIO bucket %s ready", storage.bucket)
    except Exception:  # noqa: BLE001 — startup must be defensive
        logger.warning(
            "Failed to ensure MinIO bucket %s exists; storage may be unavailable",
            storage.bucket,
            exc_info=True,
        )
