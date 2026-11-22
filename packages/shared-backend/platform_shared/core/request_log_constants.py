"""Constants for the per-request access log."""
from __future__ import annotations

# Logged in place of the path when no route matched (a 404, or the redirect
# FastAPI sends for a trailing slash): the raw path may carry a token.
UNMATCHED_REQUEST_PATH = "<unmatched route>"
# The audience fastapi-users puts on bearer access tokens.
ACCESS_TOKEN_AUDIENCE = "fastapi-users:auth"

__all__ = ["ACCESS_TOKEN_AUDIENCE", "UNMATCHED_REQUEST_PATH"]
