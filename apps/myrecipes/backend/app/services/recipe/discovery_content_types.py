"""Content-type checks for the fetches behind discovered-recipe thumbnails.

Each takes a raw ``Content-Type`` header value, as ``fetch_capped`` hands it
over before the body is read.
"""
from __future__ import annotations

from app.core.discovery_image_constants import ALLOWED_IMAGE_TYPES


def media_type(content_type: str) -> str:
    """The bare, lowercased media type: ``image/jpeg; charset=binary`` is ``image/jpeg``."""
    return content_type.split(";")[0].strip().lower()


def is_html_type(content_type: str) -> bool:
    """Whether a page may carry an ``og:image`` tag worth reading."""
    return "html" in media_type(content_type)


def is_allowed_image_type(content_type: str) -> bool:
    """Whether the image proxy may serve a body of this type."""
    return media_type(content_type) in ALLOWED_IMAGE_TYPES
