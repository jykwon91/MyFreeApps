"""Shared tuning for :mod:`platform_shared.core.capped_fetch`."""
from __future__ import annotations

from typing import Final

# Statuses that carry a ``Location`` to follow. Redirects are walked by hand,
# never by httpx, so the SSRF guard re-validates every hop.
REDIRECT_STATUSES: Final[frozenset[int]] = frozenset({301, 302, 303, 307, 308})

# Hops followed when a caller does not choose its own cap. A handful covers
# legitimate canonicalisation (http to https, trailing slash, vanity host to
# real host).
DEFAULT_MAX_REDIRECTS: Final = 5

# Content codings the capped reader decodes itself, so every decoded byte is
# counted against the cap as it is produced. httpx's own decoders inflate a
# whole raw chunk before the caller sees it (a gzip bomb turns one network
# read into tens of megabytes), so the body is read raw and anything outside
# this set, or more than one coding stacked, is refused.
SUPPORTED_CONTENT_CODINGS: Final[frozenset[str]] = frozenset({"identity", "gzip", "deflate"})

# Older servers still send the ``x-gzip`` alias (RFC 9110 section 8.4.1.3).
CONTENT_CODING_ALIASES: Final[dict[str, str]] = {"x-gzip": "gzip"}

# Sent on every request so a server only picks codings we can decode.
ACCEPT_ENCODING: Final = "gzip, deflate"
