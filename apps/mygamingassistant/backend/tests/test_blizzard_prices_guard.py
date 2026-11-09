"""Boot guard: production refuses to start when prices refresh without Blizzard credentials."""
import logging

import pytest

from app.core.blizzard_prices_guard import check_blizzard_prices_configured
from app.core.blizzard_prices_not_configured_error import BlizzardPricesNotConfiguredError
from app.core.config import settings


def _configure(monkeypatch: pytest.MonkeyPatch, *, enabled: bool, client_id: str, secret: str, env: str) -> None:
    monkeypatch.setattr(settings, "wow_price_refresh_enabled", enabled)
    monkeypatch.setattr(settings, "blizzard_client_id", client_id)
    monkeypatch.setattr(settings, "blizzard_client_secret", secret)
    monkeypatch.setattr(settings, "environment", env)


@pytest.mark.parametrize(("client_id", "secret"), [("", ""), ("id", ""), ("", "secret")])
def test_production_refuses_to_boot_without_both_credentials(
    monkeypatch: pytest.MonkeyPatch, client_id: str, secret: str,
) -> None:
    _configure(monkeypatch, enabled=True, client_id=client_id, secret=secret, env="production")
    with pytest.raises(BlizzardPricesNotConfiguredError, match="BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET"):
        check_blizzard_prices_configured()


def test_production_boots_with_both_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch, enabled=True, client_id="id", secret="secret", env="production")
    check_blizzard_prices_configured()


def test_prices_switched_off_need_no_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch, enabled=False, client_id="", secret="", env="production")
    check_blizzard_prices_configured()


def test_development_only_warns(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    _configure(monkeypatch, enabled=True, client_id="", secret="", env="development")
    with caplog.at_level(logging.WARNING, logger="app"):
        check_blizzard_prices_configured()
    assert "BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET" in caplog.text
