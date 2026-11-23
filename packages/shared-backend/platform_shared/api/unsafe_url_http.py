"""The HTTP answer when the SSRF guard refuses a URL, shared by every app's routes."""
from __future__ import annotations

import logging

from fastapi import HTTPException

from platform_shared.core.url_safety import UnsafeURLError
from platform_shared.core.url_safety_messages import UNSAFE_URL_DETAIL

logger = logging.getLogger(__name__)

_UNSAFE_URL_STATUS = 400


def unsafe_url_http_exception(exc: UnsafeURLError) -> HTTPException:
    """400 with fixed copy; the guard's reason is logged, never sent."""
    logger.warning("Refused an unsafe URL: %s", exc)
    return HTTPException(status_code=_UNSAFE_URL_STATUS, detail=UNSAFE_URL_DETAIL)
