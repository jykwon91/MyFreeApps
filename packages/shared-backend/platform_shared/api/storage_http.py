"""The HTTP answer when object storage isn't configured, shared by every app's routes."""
from __future__ import annotations

import logging

from fastapi import HTTPException

from platform_shared.core.storage import StorageNotConfiguredError
from platform_shared.core.storage_messages import STORAGE_NOT_CONFIGURED_DETAIL

logger = logging.getLogger(__name__)

_STORAGE_NOT_CONFIGURED_STATUS = 503


def storage_not_configured_http_exception(exc: StorageNotConfiguredError) -> HTTPException:
    """503 with fixed copy; the exception's own text is logged, never sent."""
    logger.error("Object storage is not configured: %s", exc, exc_info=exc)
    return HTTPException(
        status_code=_STORAGE_NOT_CONFIGURED_STATUS,
        detail=STORAGE_NOT_CONFIGURED_DETAIL,
    )
