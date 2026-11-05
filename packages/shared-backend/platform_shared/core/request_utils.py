"""Request introspection helpers shared across core modules.

Lives in its own module so that auth_event logging can read the client IP
without importing from rate_limit (which itself needs to log auth events on
per-IP login blocks). Keeping this here avoids the
rate_limit <-> auth_event_service circular import.
"""
from ipaddress import IPv6Address, ip_address

from fastapi import Request


def _is_plain_ip(value: str) -> bool:
    try:
        address = ip_address(value)
    except ValueError:
        return False
    # A scope ("fe80::1%eth0") can be any length, and never comes from the internet.
    return not (isinstance(address, IPv6Address) and address.scope_id)


def get_client_ip(request: Request) -> str:
    """Return the originating client IP for ``request``.

    Honours ``X-Forwarded-For`` (first hop) when present so that requests
    arriving via a reverse proxy (Caddy in production) are attributed to the
    real caller, not the proxy. Anything that isn't an IP address is ignored:
    the result is a rate-limit key and goes in a 45-character audit column, whose
    insert shares a transaction with the failed-login count.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first_hop = forwarded.split(",")[0].strip()
        if _is_plain_ip(first_hop):
            return first_hop
    return request.client.host if request.client else "unknown"
