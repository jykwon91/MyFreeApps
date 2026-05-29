"""Screenshot byte loader for the classifier (server-side MinIO read).

The single-image (re-classify) path needs the stored stand-screenshot bytes to
re-run Claude. This reads them server-side via the internal storage client (no
presigning needed for a backend read).

Extracted from the former ``classifier_service.py`` (a utility grab-bag) so the
storage read has a cohesive home with a PUBLIC name.
"""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def fetch_screenshot_bytes(key: Optional[str]) -> Optional[bytes]:
    """Fetch a screenshot from MinIO by object key. Returns None if key is empty."""
    if not key:
        return None
    try:
        from app.core.storage import get_storage

        storage = get_storage()
        # Use internal client for server-side reads (no presigning needed).
        from platform_shared.core.storage import _DualEndpointStorageClient

        client = storage._client if not isinstance(storage, _DualEndpointStorageClient) else storage._client
        response = client.get_object(storage.bucket, key)
        data = response.read()
        response.close()
        response.release_conn()
        return data
    except Exception as exc:
        logger.warning(
            "classifier: failed to fetch screenshot: key=%s error=%s",
            key, str(exc),
        )
        return None
