"""An ``httpx.Response`` whose body is still unread, as it is off the network.

``httpx.Response(content=b"...")`` reads its body at construction, so code
that streams the raw body (``aiter_raw``, as
:mod:`platform_shared.core.capped_fetch` does) gets ``StreamConsumed``.
Tests that serve a fixed body through ``httpx.MockTransport`` to such code
build their responses with this instead::

    httpx.MockTransport(lambda request: streamed_response(200, content=b"ok"))
"""
from __future__ import annotations

from collections.abc import Mapping

import httpx


def streamed_response(
    status_code: int,
    *,
    content: bytes = b"",
    headers: Mapping[str, str] | None = None,
    request: httpx.Request | None = None,
) -> httpx.Response:
    """A response carrying ``content`` as an unread stream."""
    return httpx.Response(
        status_code,
        headers={"content-length": str(len(content)), **(headers or {})},
        stream=httpx.ByteStream(content),
        request=request,
    )
