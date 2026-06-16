"""SSRF-safe validation for server-side URL fetches.

Any feature where the server fetches a URL chosen (directly or indirectly)
by a user is a Server-Side Request Forgery vector: the attacker picks the
destination, so without a guard the server can be coerced into requesting
internal-only addresses — cloud metadata (``169.254.169.254``), loopback,
RFC1918 hosts, or sibling services on the same Docker network / VPS — and
returning the response to the attacker.

This module centralises the defence so every app shares one audited
implementation (a Tier-1 security primitive per the monorepo parity rules).

Two layers, and callers MUST apply BOTH:

1. :func:`validate_public_url` — parse, require http(s) + an allowed port,
   resolve the host to *every* address it maps to, and reject if **any**
   resolved address is non-global (private / loopback / link-local /
   reserved / multicast / unspecified) or a known cloud-metadata IP.
   Resolving every record and rejecting on any disallowed one defeats the
   simple multi-answer DNS-rebinding trick (mixing a public and a private
   answer in one DNS reply). Relying on the OS resolver also normalises the
   many alternate IP encodings attackers use (decimal ``2130706433``,
   octal ``0177.0.0.1``, IPv4-mapped IPv6 ``::ffff:127.0.0.1``) — they all
   resolve to the real address, which is then classified.

2. The caller MUST disable transparent redirect-following and re-validate
   every hop with :func:`assert_url_safe`, because a public URL can ``302``
   into an internal one.

Known residual
==============
A pure DNS-rebinding TOCTOU — the authoritative server answers with a
public IP at validation time and a private IP a few milliseconds later when
the HTTP client re-resolves to open the socket — is not fully closed here,
because pinning the socket to the validated IP while preserving TLS
hostname verification is not cleanly supported by httpx. It is a narrow,
timing-dependent vector; the resolve-all-reject-any rule above plus a short
fetch timeout shrink it materially. Closing it completely requires a
connect-time peer-IP check inside a custom transport — tracked as a
follow-up rather than shipped as fragile httpcore-internal coupling.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import ParseResult, urlparse

__all__ = [
    "UnsafeURLError",
    "validate_public_url",
    "assert_url_safe",
]


class UnsafeURLError(ValueError):
    """The URL is syntactically valid but points at a disallowed target.

    Subclasses :class:`ValueError` so existing handlers that map a bad URL
    to ``400 Bad Request`` route it correctly without new wiring.
    """


# Schemes we are willing to fetch. ``file://``, ``gopher://``, ``ftp://``,
# ``data:`` etc. are all SSRF/exfil primitives and never legitimate here.
_ALLOWED_SCHEMES: frozenset[str] = frozenset({"http", "https"})

# Default port allowlist. Job postings (and every other legitimate public
# fetch target so far) live on the standard web ports; refusing everything
# else removes the "reach an internal service on :8000/:9000/:5432" surface
# even before IP classification.
_DEFAULT_ALLOWED_PORTS: frozenset[int] = frozenset({80, 443})

# Cloud instance-metadata endpoints. All are already non-global (link-local),
# so they are caught by the ``is_global`` check below — listed explicitly as
# documentation of intent and a belt-and-suspenders guard.
_METADATA_IPS: frozenset[ipaddress.IPv4Address | ipaddress.IPv6Address] = frozenset(
    {
        ipaddress.ip_address("169.254.169.254"),  # AWS / GCP / Azure / DO IMDS
        ipaddress.ip_address("fd00:ec2::254"),  # AWS IMDS over IPv6
    }
)


def _is_disallowed_ip(
    ip: ipaddress.IPv4Address | ipaddress.IPv6Address,
) -> bool:
    """Return True if ``ip`` must never be the target of a server fetch."""
    # Unwrap IPv4-mapped IPv6 (``::ffff:10.0.0.1``) so the embedded v4
    # address is classified, not the wrapper — otherwise an attacker tunnels
    # a private v4 target through a "global" v6 form.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped

    if ip in _METADATA_IPS:
        return True

    # ``is_global`` alone is the comprehensive check (its False set is the
    # union of every special-purpose range); the explicit predicates are
    # spelled out for readability and to stay correct if a future Python
    # narrows ``is_global``.
    return (
        not ip.is_global
        or ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def _resolve_host(
    host: str, port: int
) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    """Resolve ``host`` to every IP it maps to (A + AAAA).

    Numeric hosts (``127.0.0.1``, ``::1``) are returned without a network
    lookup by the resolver. Patched in tests to avoid real DNS.

    Raises:
        UnsafeURLError: the host could not be resolved.
    """
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise UnsafeURLError(f"could not resolve host {host!r}") from exc

    addresses: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for info in infos:
        sockaddr = info[4]
        # sockaddr[0] is the textual IP for both AF_INET and AF_INET6.
        addresses.append(ipaddress.ip_address(sockaddr[0]))
    if not addresses:
        raise UnsafeURLError(f"host {host!r} resolved to no addresses")
    return addresses


def validate_public_url(
    url: str,
    *,
    allowed_ports: frozenset[int] = _DEFAULT_ALLOWED_PORTS,
) -> ParseResult:
    """Validate that ``url`` is safe to fetch from the server.

    Enforces scheme + port, then resolves the host and rejects if ANY
    resolved address is non-public. This performs a (cached, usually
    sub-millisecond) DNS lookup — prefer :func:`assert_url_safe` from async
    code so the resolver runs off the event loop.

    Args:
        url: The absolute http(s) URL to validate.
        allowed_ports: Ports permitted on the target. Defaults to ``{80, 443}``.

    Returns:
        The parsed URL on success.

    Raises:
        UnsafeURLError: scheme/port disallowed, host missing or unresolvable,
            or the host resolves to a non-public address.
    """
    if not isinstance(url, str) or not url.strip():
        raise UnsafeURLError("url must be a non-empty string")

    parsed = urlparse(url.strip())

    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise UnsafeURLError(
            f"url scheme must be http or https, got {parsed.scheme!r}"
        )

    host = parsed.hostname  # lowercased, IPv6 brackets stripped, userinfo removed
    if not host:
        raise UnsafeURLError("url must include a host")

    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as exc:
        # urlparse raises on out-of-range ports (e.g. ``:99999``).
        raise UnsafeURLError("url has an invalid port") from exc

    if port not in allowed_ports:
        raise UnsafeURLError(
            f"url port {port} is not permitted (allowed: {sorted(allowed_ports)})"
        )

    for ip in _resolve_host(host, port):
        if _is_disallowed_ip(ip):
            raise UnsafeURLError(
                f"url host {host!r} resolves to a non-public address ({ip})"
            )

    return parsed


async def assert_url_safe(
    url: str,
    *,
    allowed_ports: frozenset[int] = _DEFAULT_ALLOWED_PORTS,
) -> ParseResult:
    """Async wrapper around :func:`validate_public_url`.

    Runs the (blocking) DNS resolution in the default executor so the event
    loop is never blocked on a slow nameserver. Call this once for the
    original URL and again for every redirect hop before issuing the request.

    Raises:
        UnsafeURLError: see :func:`validate_public_url`.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, lambda: validate_public_url(url, allowed_ports=allowed_ports)
    )
