"""A URL cut down to what's safe to write to a log.

Job-posting links can carry tracking ids, session tokens or credentials in
their userinfo, query string or fragment, so logs keep only the scheme, host,
port and path.
"""
from __future__ import annotations

from urllib.parse import urlsplit


def loggable_url(url: str) -> str:
    """``url`` without its userinfo, query string and fragment."""
    parts = urlsplit(url.strip())
    host = parts.hostname or ""
    try:
        port = parts.port
    except ValueError:
        port = None
    netloc = f"{host}:{port}" if port is not None else host
    return f"{parts.scheme}://{netloc}{parts.path}" if parts.scheme else f"{netloc}{parts.path}"
