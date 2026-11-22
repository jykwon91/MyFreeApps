"""The path of a request as it is safe to log: its route template.

Some paths carry a bearer token (``/organizations/invites/{token}/accept``,
a public share link). The request log runs on every request at INFO, so the
raw path would write those tokens to the logs and to Sentry breadcrumbs. Once
the router has matched, the route's template (``.../invites/{token}/accept``)
is logged instead; it also groups log lines by endpoint. With no match there
is no template, so a fixed placeholder is logged rather than the raw path.
"""
from __future__ import annotations

from fastapi import Request

from platform_shared.core.request_log_constants import UNMATCHED_REQUEST_PATH


def request_log_path(request: Request) -> str:
    """The matched route's template, or a placeholder when no route matched."""
    template = getattr(request.scope.get("route"), "path", None)
    if not isinstance(template, str):
        return UNMATCHED_REQUEST_PATH
    return f"{request.scope.get('root_path', '')}{template}"


__all__ = ["request_log_path"]
