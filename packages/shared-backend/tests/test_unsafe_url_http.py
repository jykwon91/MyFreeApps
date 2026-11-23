"""platform_shared.api.unsafe_url_http: a refused URL gets fixed copy, not the guard's reason."""
from __future__ import annotations

import logging

import pytest

from platform_shared.api.unsafe_url_http import unsafe_url_http_exception
from platform_shared.core.url_safety import UnsafeURLError, validate_public_url
from platform_shared.core.url_safety_messages import UNSAFE_URL_DETAIL


def _real_error() -> UnsafeURLError:
    with pytest.raises(UnsafeURLError) as info:
        validate_public_url("http://127.0.0.1/")
    return info.value


def test_reply_is_fixed_copy_not_the_resolved_address() -> None:
    exc = _real_error()
    assert "127.0.0.1" in str(exc)

    http = unsafe_url_http_exception(exc)

    assert http.status_code == 400
    assert http.detail == UNSAFE_URL_DETAIL
    assert "127.0.0.1" not in http.detail


def test_real_reason_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    exc = _real_error()

    with caplog.at_level(logging.WARNING, logger="platform_shared.api.unsafe_url_http"):
        unsafe_url_http_exception(exc)

    assert any("127.0.0.1" in r.getMessage() for r in caplog.records)
