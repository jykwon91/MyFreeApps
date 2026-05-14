"""Eager bucket setup, called from FastAPI lifespan.

Mirrors apps/myjobhunter/backend/app/services/storage/bucket_initializer.py.
"""
from platform_shared.services.storage.bucket_initializer import (
    ensure_bucket as _shared_ensure_bucket,
)

from app.core.config import settings
from app.core.storage import get_storage


def ensure_bucket() -> None:
    """Ensure the configured bucket exists. Raises on any error."""
    _shared_ensure_bucket(
        get_storage=get_storage,
        skip_check=lambda: settings.minio_skip_startup_check,
    )
