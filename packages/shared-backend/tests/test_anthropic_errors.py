"""platform_shared.extraction.anthropic_errors + the extraction boot guard.

The mapper was extracted from MGA's WoW item reader; these tests pin the
classification AND the log text (MGA's API tests assert the documented
``error.type`` reaches the log).
"""
from __future__ import annotations

import logging

import anthropic
import httpx2
import pytest

from platform_shared.core.boot_guards import check_extraction_configured
from platform_shared.extraction.anthropic_errors import (
    AnthropicFailureKind,
    map_anthropic_connection_error,
    map_anthropic_status_error,
)
from platform_shared.extraction.errors import ExtractionNotConfiguredError

_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _status_error(
    cls: type[anthropic.APIStatusError], status: int, error_type: str | None
) -> anthropic.APIStatusError:
    response = httpx2.Response(status, request=_REQUEST)
    body = (
        {"type": "error", "error": {"type": error_type, "message": "boom"}}
        if error_type
        else None
    )
    return cls("boom", response=response, body=body)


@pytest.mark.parametrize(
    ("cls", "status", "error_type", "kind", "level"),
    [
        (anthropic.RateLimitError, 429, "rate_limit_error", AnthropicFailureKind.RATE_LIMITED, logging.WARNING),
        (anthropic.AuthenticationError, 401, "authentication_error", AnthropicFailureKind.MISCONFIGURED, logging.ERROR),
        (anthropic.PermissionDeniedError, 403, "permission_error", AnthropicFailureKind.MISCONFIGURED, logging.ERROR),
        (anthropic.BadRequestError, 400, "invalid_request_error", AnthropicFailureKind.INPUT_REJECTED, logging.WARNING),
        (anthropic.InternalServerError, 529, "overloaded_error", AnthropicFailureKind.UPSTREAM, logging.ERROR),
        (anthropic.InternalServerError, 500, "api_error", AnthropicFailureKind.UPSTREAM, logging.ERROR),
    ],
)
def test_status_errors_are_classified_and_logged(
    cls: type[anthropic.APIStatusError],
    status: int,
    error_type: str,
    kind: AnthropicFailureKind,
    level: int,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    failure = map_anthropic_status_error(
        _status_error(cls, status, error_type), log_prefix="feature x"
    )
    assert failure.kind is kind
    assert failure.error_type == error_type
    assert failure.status == status
    record = caplog.records[-1]
    assert record.levelno == level
    assert record.getMessage().startswith("feature x: ")
    assert error_type in record.getMessage()


def test_missing_error_type_falls_back_to_http_status() -> None:
    failure = map_anthropic_status_error(
        _status_error(anthropic.InternalServerError, 502, None), log_prefix="x"
    )
    assert failure.error_type == "http_502"
    assert failure.kind is AnthropicFailureKind.UPSTREAM


def test_uses_the_callers_logger(caplog: pytest.LogCaptureFixture) -> None:
    caller = logging.getLogger("app.some.feature")
    map_anthropic_status_error(
        _status_error(anthropic.RateLimitError, 429, "rate_limit_error"),
        log_prefix="x",
        logger=caller,
    )
    assert caplog.records[-1].name == "app.some.feature"


def test_connection_error_is_upstream(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING)
    failure = map_anthropic_connection_error(
        anthropic.APITimeoutError(request=_REQUEST), log_prefix="x"
    )
    assert failure.kind is AnthropicFailureKind.UPSTREAM
    assert failure.error_type == "connection_error"
    assert "APITimeoutError" in caplog.text


class TestCheckExtractionConfigured:
    @pytest.mark.parametrize("environment", ["development", "test"])
    def test_dev_and_test_allow_empty_key(self, environment: str) -> None:
        check_extraction_configured(anthropic_api_key="", environment=environment)

    def test_production_with_key_passes(self) -> None:
        check_extraction_configured(anthropic_api_key="sk-test", environment="production")

    @pytest.mark.parametrize("environment", ["production", "staging", "canary"])
    def test_non_dev_without_key_raises(self, environment: str) -> None:
        with pytest.raises(ExtractionNotConfiguredError, match="ANTHROPIC_API_KEY must be set"):
            check_extraction_configured(anthropic_api_key="", environment=environment)
