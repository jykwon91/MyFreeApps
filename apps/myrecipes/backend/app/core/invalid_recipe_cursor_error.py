"""Raised when ``GET /recipes`` gets a cursor it did not hand out."""
from __future__ import annotations


class InvalidRecipeCursorError(ValueError):
    """The cursor isn't one the list returned (edited, truncated or made up). The route maps it to HTTP 400."""
