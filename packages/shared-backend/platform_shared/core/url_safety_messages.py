"""What a request is told when the SSRF guard refuses a URL it supplied.

``UnsafeURLError`` names the host and, for a refused address, the private IP
it resolved to: for an internal name that maps the server's network. Routes
log that and send this fixed copy instead.
"""
from __future__ import annotations

from typing import Final

UNSAFE_URL_DETAIL: Final = "That URL can't be opened."
