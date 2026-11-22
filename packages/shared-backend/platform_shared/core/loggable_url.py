"""A URL cut down to what's safe to write to a log.

Job-posting links can carry tracking ids, session tokens or credentials in
their userinfo, query string or fragment, so logs keep only the scheme, host,
port and path.
"""
from __future__ import annotations

from urllib.parse import urlsplit


UNPARSEABLE_URL = "<unparseable url>"


def loggable_url(url: str) -> str:
    """``url`` without its userinfo, query string and fragment. Never raises."""
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        # e.g. an unclosed IPv6 bracket; nothing of it is known to be safe.
        return UNPARSEABLE_URL
    host = parts.hostname or ""
    if ":" in host:
        host = f"[{host}]"
    try:
        port = parts.port
    except ValueError:
        port = None
    netloc = f"{host}:{port}" if port is not None else host
    return f"{parts.scheme}://{netloc}{parts.path}" if parts.scheme else f"{netloc}{parts.path}"


__all__ = ["UNPARSEABLE_URL", "loggable_url"]
