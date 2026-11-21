"""The host of a URL, the only part of a user-supplied URL safe to log."""
from __future__ import annotations

from urllib.parse import urlsplit


def url_host(url: str) -> str:
    """``url``'s lowercased host, or ``""`` if it has none or will not parse.

    Never raises: it is called while logging a failure, often for a URL that
    failed because it is malformed.
    """
    try:
        return urlsplit(url).hostname or ""
    except ValueError:
        return ""
