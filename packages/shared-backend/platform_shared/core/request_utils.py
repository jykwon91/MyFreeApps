"""Request introspection helpers shared across core modules.

Lives in its own module so that auth_event logging can read the client IP
without importing from rate_limit (which itself needs to log auth events on
per-IP login blocks). Keeping this here avoids the
rate_limit <-> auth_event_service circular import.
"""
from fastapi import Request


def get_client_ip(request: Request) -> str:
    """Return the originating client IP for ``request``.

    Honours ``X-Forwarded-For`` (first hop) when present so that requests
    arriving via a reverse proxy (Caddy in production) are attributed to the
    real caller, not the proxy.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
