"""Which Google OAuth and Gmail failures mean "reconnect" and which mean "try again"."""
from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError

from app.services.email.gmail_failure_classifier import (
    classify_http_error,
    classify_refresh_error,
    describe_http_error,
    http_error_reasons,
    refresh_error_code,
)
from app.services.email.gmail_failure_kind import GmailFailureKind


def _http_error(status: int, reason: str | None = None) -> HttpError:
    body = {"error": {"code": status, "errors": [{"reason": reason}] if reason else []}}
    return HttpError(MagicMock(status=status, reason="x"), json.dumps(body).encode())


def test_revoked_grant_needs_reauth_whether_the_code_is_in_the_body_or_the_message() -> None:
    from_body = RefreshError("invalid_grant: Token revoked", {"error": "invalid_grant"})
    from_message = RefreshError("invalid_grant")

    assert classify_refresh_error(from_body) is GmailFailureKind.REAUTH
    assert classify_refresh_error(from_message) is GmailFailureKind.REAUTH
    assert refresh_error_code(from_body) == "invalid_grant"
    assert refresh_error_code(from_message) == "invalid_grant"


def test_retryable_token_endpoint_failure_is_transient_even_with_an_error_body() -> None:
    outage = RefreshError("server_error: try later", {"error": "server_error"}, retryable=True)

    assert classify_refresh_error(outage) is GmailFailureKind.TRANSIENT
    assert refresh_error_code(outage) == "server_error"


def test_permanent_non_revocation_failure_is_not_treated_as_a_revoked_token() -> None:
    misconfigured = RefreshError("invalid_client: bad secret", {"error": "invalid_client"})

    assert classify_refresh_error(misconfigured) is GmailFailureKind.OTHER


@pytest.mark.parametrize(
    ("status", "reason", "expected"),
    [
        (401, None, GmailFailureKind.REAUTH),
        (403, "insufficientPermissions", GmailFailureKind.SCOPE_MISSING),
        (403, "rateLimitExceeded", GmailFailureKind.TRANSIENT),
        (403, "userRateLimitExceeded", GmailFailureKind.TRANSIENT),
        (429, None, GmailFailureKind.TRANSIENT),
        (500, None, GmailFailureKind.TRANSIENT),
        (503, None, GmailFailureKind.TRANSIENT),
        (404, None, GmailFailureKind.NOT_FOUND),
        (400, None, GmailFailureKind.OTHER),
    ],
)
def test_gmail_http_errors_are_told_apart(status: int, reason: str | None, expected: GmailFailureKind) -> None:
    assert classify_http_error(_http_error(status, reason)) is expected


def test_reasons_and_description_come_from_the_response_body() -> None:
    exc = _http_error(403, "insufficientPermissions")

    assert http_error_reasons(exc) == {"insufficientPermissions"}
    assert describe_http_error(exc) == "status=403 reasons=['insufficientPermissions']"


def test_a_non_json_error_body_has_no_reasons() -> None:
    exc = HttpError(MagicMock(status=403, reason="x"), b"<html>nope</html>")

    assert http_error_reasons(exc) == set()
    assert classify_http_error(exc) is GmailFailureKind.SCOPE_MISSING
