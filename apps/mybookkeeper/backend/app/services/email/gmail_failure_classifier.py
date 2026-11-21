"""Tell Google OAuth and Gmail API failures apart so each is handled for what it is.

Only a revoked or expired grant means the user must reconnect. Outages and rate
limits are retried on the next cycle, a deleted message is final for that
message, and anything unrecognised is surfaced rather than guessed at.
"""
from __future__ import annotations

import json
from typing import Any

from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError

from app.services.email.constants import (
    GMAIL_RATE_LIMIT_REASONS,
    GOOGLE_REVOKED_GRANT_OAUTH_ERRORS,
)
from app.services.email.gmail_failure_kind import GmailFailureKind

_HTTP_UNAUTHORIZED = 401
_HTTP_FORBIDDEN = 403
_HTTP_NOT_FOUND = 404
_HTTP_TOO_MANY_REQUESTS = 429
_HTTP_SERVER_ERROR_MIN = 500


def reasons_from_error_body(body: Any) -> set[str]:
    """Reasons from both Google error shapes: ``error.errors[]`` and ``error.details[]``."""
    if not isinstance(body, dict) or not isinstance(body.get("error"), dict):
        return set()
    error = body["error"]
    entries = [
        *(error.get("errors") if isinstance(error.get("errors"), list) else []),
        *(error.get("details") if isinstance(error.get("details"), list) else []),
    ]
    return {e["reason"] for e in entries if isinstance(e, dict) and isinstance(e.get("reason"), str)}


def http_error_status(exc: HttpError) -> int | None:
    status = getattr(getattr(exc, "resp", None), "status", None)
    return status if isinstance(status, int) else None


def http_error_reasons(exc: HttpError) -> set[str]:
    try:
        return reasons_from_error_body(json.loads(exc.content.decode("utf-8")))
    except (ValueError, AttributeError):
        return set()


def describe_http_error(exc: HttpError) -> str:
    """``status=403 reasons=['insufficientPermissions']`` for log lines."""
    return f"status={http_error_status(exc)} reasons={sorted(http_error_reasons(exc))}"


def refresh_error_code(exc: RefreshError) -> str | None:
    """The OAuth ``error`` field (``invalid_grant``, ...), from the response body or the message."""
    body = exc.args[1] if len(exc.args) > 1 else None
    if isinstance(body, dict) and isinstance(body.get("error"), str):
        return body["error"]
    message = str(exc.args[0]) if exc.args else ""
    code = message.split(":", 1)[0].strip()
    return code or None


def classify_refresh_error(exc: RefreshError) -> GmailFailureKind:
    """google-auth marks token-endpoint 5xx and 429 ``retryable``; only a revoked grant needs a reconnect."""
    if exc.retryable:
        return GmailFailureKind.TRANSIENT
    if refresh_error_code(exc) in GOOGLE_REVOKED_GRANT_OAUTH_ERRORS:
        return GmailFailureKind.REAUTH
    return GmailFailureKind.OTHER


def classify_http_error(exc: HttpError) -> GmailFailureKind:
    status = http_error_status(exc)
    if status == _HTTP_UNAUTHORIZED:
        return GmailFailureKind.REAUTH
    if status == _HTTP_FORBIDDEN:
        if http_error_reasons(exc) & GMAIL_RATE_LIMIT_REASONS:
            return GmailFailureKind.TRANSIENT
        return GmailFailureKind.SCOPE_MISSING
    if status == _HTTP_TOO_MANY_REQUESTS or (status is not None and status >= _HTTP_SERVER_ERROR_MIN):
        return GmailFailureKind.TRANSIENT
    if status == _HTTP_NOT_FOUND:
        return GmailFailureKind.NOT_FOUND
    return GmailFailureKind.OTHER
