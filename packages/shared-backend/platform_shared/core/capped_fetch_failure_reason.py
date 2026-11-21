"""Why a :func:`platform_shared.core.capped_fetch.fetch_capped` call failed."""
from __future__ import annotations

from typing import Literal

CappedFetchFailureReason = Literal[
    # The overall deadline passed, or httpx timed out a single phase.
    "timeout",
    # The body passed the byte cap; the read stopped there.
    "too_large",
    # More redirect hops than the caller allows.
    "too_many_redirects",
    # The final response was not 2xx. ``status_code`` says which.
    "http_status",
    # Connection, TLS or protocol failure before a usable response.
    "network",
    # A Content-Encoding we refuse (unknown, or several stacked), or a body
    # that did not decode.
    "bad_encoding",
    # The caller's content-type check refused the response before its body
    # was read.
    "unexpected_content_type",
]
