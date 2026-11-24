"""Unit tests for platform_shared.core.observability.init_sentry()."""

from unittest.mock import patch, MagicMock

import pytest
from sentry_sdk.types import Event

from platform_shared.core.database_error_summary import summarize_database_error
from platform_shared.core.observability import (
    SentryNotConfiguredError,
    _before_send,
    _drop_known_noise,
    init_sentry,
)
from platform_shared.core.sentry_database_scrubbing import scrub_breadcrumb, scrub_log
from tests.database_error_samples import PROBE_VALUE, unique_violation


class TestProductionEnforcement:
    def test_raises_in_production_when_dsn_empty(self) -> None:
        with pytest.raises(SentryNotConfiguredError) as exc:
            init_sentry(dsn="", environment="production")
        assert "SENTRY_DSN is required in production" in str(exc.value)

    def test_does_not_raise_in_development_when_dsn_empty(self) -> None:
        # Should be a silent no-op
        init_sentry(dsn="", environment="development")

    def test_does_not_raise_in_test_when_dsn_empty(self) -> None:
        init_sentry(dsn="", environment="test")

    def test_does_not_raise_in_staging_when_dsn_empty(self) -> None:
        # staging is non-production by our convention
        init_sentry(dsn="", environment="staging")


class TestSentryInit:
    @patch("platform_shared.core.observability.sentry_sdk.init")
    def test_initialises_sdk_when_dsn_set(self, mock_init: MagicMock) -> None:
        init_sentry(dsn="https://abc@o123.ingest.sentry.io/456", environment="production")
        mock_init.assert_called_once()
        call_kwargs = mock_init.call_args.kwargs
        assert call_kwargs["dsn"] == "https://abc@o123.ingest.sentry.io/456"
        assert call_kwargs["environment"] == "production"
        assert call_kwargs["send_default_pii"] is False
        assert call_kwargs["max_request_body_size"] == "never"
        assert call_kwargs["traces_sample_rate"] == 0.1
        assert len(call_kwargs["integrations"]) == 1

    @patch("platform_shared.core.observability.sentry_sdk.init")
    def test_initialises_sdk_in_development_when_dsn_set(self, mock_init: MagicMock) -> None:
        init_sentry(dsn="https://x@y/1", environment="development")
        mock_init.assert_called_once()
        assert mock_init.call_args.kwargs["environment"] == "development"

    @patch("platform_shared.core.observability.sentry_sdk.init")
    def test_does_not_initialise_when_dsn_empty_in_dev(self, mock_init: MagicMock) -> None:
        init_sentry(dsn="", environment="development")
        mock_init.assert_not_called()

    @patch("platform_shared.core.observability.sentry_sdk.init", side_effect=RuntimeError("boom"))
    def test_propagates_init_failure(self, mock_init: MagicMock) -> None:
        with pytest.raises(RuntimeError, match="boom"):
            init_sentry(dsn="https://x@y/1", environment="development")

    @patch("platform_shared.core.observability.sentry_sdk.init")
    def test_frame_locals_are_not_sent(self, mock_init: MagicMock) -> None:
        init_sentry(dsn="https://x@y/1", environment="production")
        assert mock_init.call_args.kwargs["include_local_variables"] is False

    @patch("platform_shared.core.observability.sentry_sdk.init")
    def test_before_send_hook_wired(self, mock_init: MagicMock) -> None:
        init_sentry(dsn="https://x@y/1", environment="production")
        assert mock_init.call_args.kwargs["before_send"] is _before_send

    @patch("platform_shared.core.observability.sentry_sdk.init")
    def test_breadcrumb_and_log_scrubbers_wired(self, mock_init: MagicMock) -> None:
        init_sentry(dsn="https://x@y/1", environment="production")
        assert mock_init.call_args.kwargs["before_breadcrumb"] is scrub_breadcrumb
        assert mock_init.call_args.kwargs["before_send_log"] is scrub_log


class TestBeforeSendChain:
    """``_before_send`` drops known noise, then summarises database errors."""

    def test_drops_known_noise(self) -> None:
        event: Event = {"logger": "googleapiclient.discovery_cache"}
        assert _before_send(event, {}) is None

    def test_summarises_database_errors_in_what_it_keeps(self) -> None:
        error = unique_violation()
        event: Event = {
            "logger": "app.services.users",
            "exception": {
                "values": [
                    {"type": "IntegrityError", "module": "sqlalchemy.exc", "value": str(error)}
                ]
            },
        }
        hint = {"exc_info": (type(error), error, error.__traceback__)}
        kept = _before_send(event, hint)
        assert kept is not None
        assert kept["exception"]["values"][0]["value"] == summarize_database_error(error)
        assert PROBE_VALUE not in str(kept)


class TestDropKnownNoise:
    """``_drop_known_noise`` filters events from named-noisy library loggers
    while preserving everything else (uncaught exceptions, app-logger events,
    explicit ``capture_*`` calls)."""

    def test_drops_googleapiclient_logger(self) -> None:
        event = {"logger": "googleapiclient.discovery_cache"}
        assert _drop_known_noise(event, {}) is None

    def test_drops_googleapiclient_root_logger(self) -> None:
        event = {"logger": "googleapiclient"}
        assert _drop_known_noise(event, {}) is None

    def test_drops_google_auth_logger(self) -> None:
        event = {"logger": "google.auth.transport.requests"}
        assert _drop_known_noise(event, {}) is None

    def test_keeps_app_logger_events(self) -> None:
        event = {"logger": "app.services.extraction.claude_service"}
        assert _drop_known_noise(event, {}) is event

    def test_keeps_event_with_no_logger_field(self) -> None:
        # Uncaught exceptions captured via the FastAPI integration don't
        # carry a ``logger`` field — must NOT be filtered.
        event = {"exception": {"values": [{"type": "ValueError"}]}}
        assert _drop_known_noise(event, {}) is event

    def test_keeps_event_with_empty_logger(self) -> None:
        event: Event = {"logger": ""}
        assert _drop_known_noise(event, {}) is event

    def test_does_not_match_unrelated_logger_with_similar_prefix(self) -> None:
        # ``googleapi`` is not on the allowlist; only ``googleapiclient`` is.
        event = {"logger": "googleapi"}
        assert _drop_known_noise(event, {}) is event
