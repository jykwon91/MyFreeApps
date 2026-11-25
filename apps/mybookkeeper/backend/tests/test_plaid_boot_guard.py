"""The Plaid boot guard: production refuses to start without every PLAID_*
value and an https FRONTEND_URL (the OAuth redirect's origin); development
and test never check."""
from __future__ import annotations

import pytest

from app.core.plaid_boot_guard import check_plaid_configured
from app.core.plaid_not_configured_error import PlaidNotConfiguredError

_GOOD = {
    "plaid_client_id": "client-1",
    "plaid_secret": "secret-1",
    "frontend_url": "https://books.example",
}


def test_production_with_everything_set_boots() -> None:
    check_plaid_configured(environment="production", **_GOOD)


@pytest.mark.parametrize("environment", ["development", "test"])
def test_development_and_test_never_check(environment: str) -> None:
    check_plaid_configured(
        environment=environment, plaid_client_id="", plaid_secret="", frontend_url="",
    )


@pytest.mark.parametrize(
    ("field", "env_name"),
    [
        ("plaid_client_id", "PLAID_CLIENT_ID"),
        ("plaid_secret", "PLAID_SECRET"),
    ],
)
def test_a_missing_value_names_the_env_var(field: str, env_name: str) -> None:
    with pytest.raises(PlaidNotConfiguredError, match=env_name) as raised:
        check_plaid_configured(environment="production", **{**_GOOD, field: ""})
    assert "ENVIRONMENT=development" not in str(raised.value)


def test_a_plain_http_frontend_url_is_refused() -> None:
    with pytest.raises(PlaidNotConfiguredError, match="https"):
        check_plaid_configured(
            environment="staging", **{**_GOOD, "frontend_url": "http://books.example"},
        )
