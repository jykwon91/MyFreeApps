"""The result of :func:`platform_shared.core.capped_fetch.fetch_capped`."""
from __future__ import annotations

from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class CappedResponse:
    """A fully read 2xx response whose body stayed within the byte cap.

    ``url`` is the final URL after redirects. ``truncated`` is only ever
    True when the caller asked for the body to be cut at the cap rather
    than refused.
    """

    url: str
    status_code: int
    headers: httpx.Headers
    content: bytes
    encoding: str
    truncated: bool

    @property
    def text(self) -> str:
        """The body decoded the way ``httpx.Response.text`` decodes it."""
        return self.content.decode(self.encoding, errors="replace")
