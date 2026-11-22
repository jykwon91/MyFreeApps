"""Per-request audit context and access log, shared by every app.

Sets the ``current_user_id`` ContextVar from a valid bearer token, so
the audit listener can record who made each change (a request without one
leaves it as it was), and writes one INFO
access line per request plus an ERROR line for any 5xx. The access log is the
main triage surface in production next to Sentry. It names the route
template, never the raw path, because some paths carry tokens.
"""
from __future__ import annotations

import logging
import time

import jwt
from jwt.exceptions import PyJWTError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from platform_shared.core.audit import current_user_id
from platform_shared.core.request_log_constants import ACCESS_TOKEN_AUDIENCE
from platform_shared.core.request_log_path import request_log_path

logger = logging.getLogger(__name__)


class RequestAuditMiddleware(BaseHTTPMiddleware):
    """Add with ``app.add_middleware(RequestAuditMiddleware, secret_key=...)``."""

    def __init__(self, app: ASGIApp, *, secret_key: str) -> None:
        super().__init__(app)
        self._secret_key = secret_key

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start = time.perf_counter()
        user_id = self._user_id(request)
        if user_id is None:
            response = await call_next(request)
        else:
            context_token = current_user_id.set(user_id)
            try:
                response = await call_next(request)
            finally:
                current_user_id.reset(context_token)

        path = request_log_path(request)
        ms = (time.perf_counter() - start) * 1000
        logger.info(
            "%s %s %s %.0fms user=%s",
            request.method, path, response.status_code, ms, user_id or "anonymous",
        )
        if response.status_code >= 500:
            logger.error("5xx on %s %s", request.method, path)
        return response

    def _user_id(self, request: Request) -> str | None:
        """The ``sub`` of a valid bearer token, or ``None``."""
        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not token:
            return None
        try:
            payload = jwt.decode(
                token, self._secret_key, algorithms=["HS256"], audience=ACCESS_TOKEN_AUDIENCE,
            )
        except PyJWTError:
            return None
        sub = payload.get("sub")
        return sub if isinstance(sub, str) else None


__all__ = ["RequestAuditMiddleware"]
