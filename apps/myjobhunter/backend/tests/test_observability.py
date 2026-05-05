"""Tests for Sentry fail-loud initialisation (app/core/observability.py).

Mirrors apps/mybookkeeper/backend/tests/test_observability.py — keep the two
in sync. The contract is:

- In production (ENVIRONMENT=production), SENTRY_DSN must be set.
  A missing DSN raises SentryNotConfiguredError at boot — lifespan
  crashes, healthcheck fails, deploy rolls back.
- In non-production environments, an empty SENTRY_DSN is silently
  accepted — Sentry is optional for local dev and CI.
- When a DSN is present, sentry_sdk.init is called with the correct
  environment tag (not a hardcoded "production" string).
- When sentry_sdk.init raises, the exception is logged as a warning and
  then re-raised so the lifespan still crashes rather than booting
  with a broken Sentry connection.

We construct a _local_ settings-like object for each test (never mutate
the module-level singleton) and patch ``app.core.observability.settings``
so ``init_sentry()`` sees the values we control.
"""
from __future__ import annotations

import logging
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.core.observability import SentryNotConfiguredError, init_sentry


def _make_settings(*, environment: str, sentry_dsn: str) -> SimpleNamespace:
    """Return a settings-like namespace used to patch observability.settings."""
    return SimpleNamespace(environment=environment, sentry_dsn=sentry_dsn)


class TestSentryNotConfiguredError:
    def test_is_runtime_error_subclass(self) -> None:
        assert issubclass(SentryNotConfiguredError, RuntimeError)

    def test_carries_message(self) -> None:
        err = SentryNotConfiguredError("missing DSN")
        assert "missing DSN" in str(err)


class TestInitSentryProductionRequiresDsn:
    """In production, a missing DSN must crash the process at boot."""

    def test_raises_when_production_and_dsn_empty(self) -> None:
        fake_settings = _make_settings(environment="production", sentry_dsn="")
        with patch("app.core.observability.settings", fake_settings):
            with pytest.raises(SentryNotConfiguredError, match="SENTRY_DSN is required"):
                init_sentry()

    def test_does_not_raise_when_production_and_dsn_set(self) -> None:
        fake_settings = _make_settings(
            environment="production", sentry_dsn="https://abc@sentry.io/123"
        )
        with patch("app.core.observability.settings", fake_settings):
            with patch("app.core.observability.sentry_sdk.init"):
                init_sentry()  # must not raise


class TestInitSentryNonProductionAllowsEmptyDsn:
    """In development / test, an empty DSN is silently skipped."""

    @pytest.mark.parametrize("env", ["development", "test", "staging", ""])
    def test_does_not_raise_when_non_production_and_dsn_empty(self, env: str) -> None:
        fake_settings = _make_settings(environment=env, sentry_dsn="")
        with patch("app.core.observability.settings", fake_settings):
            init_sentry()  # must not raise

    def test_does_not_call_sentry_init_when_dsn_empty(self) -> None:
        fake_settings = _make_settings(environment="development", sentry_dsn="")
        with patch("app.core.observability.settings", fake_settings):
            with patch("app.core.observability.sentry_sdk.init") as mock_init:
                init_sentry()
        mock_init.assert_not_called()


class TestInitSentryPassesEnvironmentTag:
    """The environment tag passed to sentry_sdk.init must come from settings,
    not from a hardcoded string."""

    @pytest.mark.parametrize("env", ["production", "staging"])
    def test_passes_environment_to_sentry(self, env: str) -> None:
        fake_settings = _make_settings(
            environment=env, sentry_dsn="https://abc@sentry.io/123"
        )
        with patch("app.core.observability.settings", fake_settings):
            with patch("app.core.observability.sentry_sdk.init") as mock_init:
                init_sentry()

        mock_init.assert_called_once()
        _, kwargs = mock_init.call_args
        assert kwargs["environment"] == env, (
            f"Expected environment={env!r} in sentry_sdk.init, got {kwargs.get('environment')!r}"
        )

    def test_passes_dsn_and_other_params(self) -> None:
        dsn = "https://abc@sentry.io/999"
        fake_settings = _make_settings(environment="production", sentry_dsn=dsn)
        with patch("app.core.observability.settings", fake_settings):
            with patch("app.core.observability.sentry_sdk.init") as mock_init:
                init_sentry()

        _, kwargs = mock_init.call_args
        assert kwargs["dsn"] == dsn
        assert kwargs["send_default_pii"] is False
        assert "traces_sample_rate" in kwargs


class TestInitSentryPropagatesInitFailure:
    """If sentry_sdk.init raises (e.g. bad DSN format), the exception must be
    logged as a warning and then re-raised so the lifespan still fails loudly."""

    def test_reraises_when_sentry_init_throws(self) -> None:
        fake_settings = _make_settings(
            environment="production", sentry_dsn="https://abc@sentry.io/123"
        )
        with patch("app.core.observability.settings", fake_settings):
            with patch(
                "app.core.observability.sentry_sdk.init",
                side_effect=RuntimeError("bad DSN"),
            ):
                with pytest.raises(RuntimeError, match="bad DSN"):
                    init_sentry()

    def test_logs_warning_before_reraising(self, caplog: pytest.LogCaptureFixture) -> None:
        fake_settings = _make_settings(
            environment="production", sentry_dsn="https://abc@sentry.io/123"
        )
        with patch("app.core.observability.settings", fake_settings):
            with patch(
                "app.core.observability.sentry_sdk.init",
                side_effect=Exception("init error"),
            ):
                with caplog.at_level(logging.WARNING, logger="app.core.observability"):
                    with pytest.raises(Exception):
                        init_sentry()

        assert any("unavailable" in r.message.lower() for r in caplog.records), (
            f"Expected a warning about Sentry being unavailable; got: {[r.message for r in caplog.records]}"
        )
