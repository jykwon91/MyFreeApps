"""platform_shared.api.storage_http: the 503 for unconfigured storage sends fixed copy."""
from __future__ import annotations

import logging

import pytest

from platform_shared.api.storage_http import storage_not_configured_http_exception
from platform_shared.core.storage import StorageNotConfiguredError, build_storage_client
from platform_shared.core.storage_messages import STORAGE_NOT_CONFIGURED_DETAIL


def _real_error() -> StorageNotConfiguredError:
    with pytest.raises(StorageNotConfiguredError) as info:
        build_storage_client(endpoint="", access_key="", secret_key="", bucket="private-bucket")
    return info.value


def test_reply_is_fixed_copy_not_the_env_var_names() -> None:
    exc = _real_error()
    assert "MINIO_ENDPOINT" in str(exc)

    http = storage_not_configured_http_exception(exc)

    assert http.status_code == 503
    assert http.detail == STORAGE_NOT_CONFIGURED_DETAIL
    assert "MINIO" not in http.detail


def test_real_error_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    exc = _real_error()

    with caplog.at_level(logging.ERROR, logger="platform_shared.api.storage_http"):
        storage_not_configured_http_exception(exc)

    assert any("MINIO_ENDPOINT" in r.getMessage() for r in caplog.records)
