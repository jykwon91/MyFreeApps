"""The /admin/db API-key gate logs and rate-limits wrong keys, never logging the key."""
from __future__ import annotations

import logging
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.rate_limit import admin_db_key_failure_limiter
from app.main import app
from app.schemas.system.db_admin import DbQueryResponse

_API_KEY = "test-admin-key"
_WRONG_KEY = "guessed-secret-value"
_QUERY = {"sql": "SELECT 1"}
_QUERY_FN = "app.api.db_admin.db_admin_service.run_readonly_query"


@pytest.fixture(autouse=True)
def _gate(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr("app.api.db_admin.settings.admin_api_key", _API_KEY)
    admin_db_key_failure_limiter.reset()
    yield
    admin_db_key_failure_limiter.reset()


def _post(key: str | None, ip: str = "203.0.113.7"):
    headers = {"X-Forwarded-For": ip}
    if key is not None:
        headers["X-Admin-Api-Key"] = key
    return TestClient(app).post("/admin/db/query", json=_QUERY, headers=headers)


def _ok_query() -> AsyncMock:
    return AsyncMock(return_value=DbQueryResponse(columns=["n"], rows=[[1]], row_count=1))


def test_wrong_key_is_rejected_and_logged_without_the_key(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.WARNING, logger="app.api.db_admin"):
        response = _post(_WRONG_KEY)

    assert response.status_code == 403
    assert "203.0.113.7" in caplog.text
    assert "/admin/db/query" in caplog.text
    assert _WRONG_KEY not in caplog.text
    assert _API_KEY not in caplog.text


def test_repeated_wrong_keys_get_429_even_for_the_right_key() -> None:
    assert {_post(_WRONG_KEY).status_code for _ in range(10)} == {403}

    assert _post(_WRONG_KEY).status_code == 429
    with patch(_QUERY_FN, new=_ok_query()) as svc:
        locked_out = _post(_API_KEY)
    assert locked_out.status_code == 429
    assert "Retry-After" in locked_out.headers
    svc.assert_not_awaited()


def test_one_ips_failures_do_not_lock_out_another_ip() -> None:
    for _ in range(11):
        _post(_WRONG_KEY, ip="203.0.113.7")

    with patch(_QUERY_FN, new=_ok_query()):
        assert _post(_API_KEY, ip="198.51.100.9").status_code == 200


def test_right_key_still_works_and_uses_no_failure_allowance() -> None:
    with patch(_QUERY_FN, new=_ok_query()):
        assert {_post(_API_KEY).status_code for _ in range(15)} == {200}


def test_empty_configured_key_is_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.db_admin.settings.admin_api_key", "")
    assert _post(_API_KEY).status_code == 503


def test_missing_key_is_401_and_logged(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.WARNING, logger="app.api.db_admin"):
        response = _post(None)
    assert response.status_code == 401
    assert "203.0.113.7" in caplog.text
