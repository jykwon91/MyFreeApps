"""Tests for Gmail OAuth callback exception logging.

The route ``GET /integrations/gmail/callback`` must log the full traceback
(including exception class) to stdout/docker-logs before propagating any
non-ValueError exception. This guarantees that production failures are
visible in ``docker logs mybookkeeper-api-1`` even when Sentry is not yet
configured.

Two layers are covered:
1. The route handler (``app/api/integrations.py``) — catches ``Exception``,
   calls ``logger.exception()``, then re-raises.
2. The service layer (``app/services/integrations/integration_service.py``) —
   ``fetch_token`` and ``upsert_gmail`` failure points each call
   ``logger.exception()`` before propagating.
"""
from __future__ import annotations

import logging
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Route-layer tests
# ---------------------------------------------------------------------------
class TestGmailCallbackRouteLogging:
    """The route handler must log unexpected exceptions before re-raising."""

    def _make_client(self) -> TestClient:
        from app.main import app
        # raise_server_exceptions=False so the TestClient returns a 500 response
        # instead of re-raising the exception in the test process.
        return TestClient(app, raise_server_exceptions=False)

    def test_logs_and_returns_500_on_unexpected_exception(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """When handle_gmail_callback raises a non-ValueError, the route logs
        the full traceback (logger.exception) and returns HTTP 500."""
        from app.api import integrations as integrations_module

        class _FakeOAuthError(Exception):
            pass

        with patch.object(
            integrations_module.integration_service,
            "handle_gmail_callback",
            new=AsyncMock(side_effect=_FakeOAuthError("token exchange failed")),
        ):
            with caplog.at_level(logging.ERROR, logger="app.api.integrations"):
                client = self._make_client()
                response = client.get(
                    "/integrations/gmail/callback",
                    params={"code": "fake-code", "state": "fake-state"},
                    follow_redirects=False,
                )

        assert response.status_code == 500
        # The logger.exception call emits at ERROR level with exc_info=True.
        error_messages = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
        assert any("Gmail OAuth callback failed" in m for m in error_messages), (
            f"Expected 'Gmail OAuth callback failed' in logs; got: {error_messages}"
        )

    def test_still_returns_400_for_value_error(self) -> None:
        """ValueError (bad state token) continues to return HTTP 400, not 500."""
        from app.api import integrations as integrations_module

        with patch.object(
            integrations_module.integration_service,
            "handle_gmail_callback",
            new=AsyncMock(side_effect=ValueError("Invalid OAuth state")),
        ):
            client = self._make_client()
            response = client.get(
                "/integrations/gmail/callback",
                params={"code": "fake-code", "state": "bad-state"},
                follow_redirects=False,
            )

        assert response.status_code == 400

    def test_does_not_log_for_value_error(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """ValueError must NOT trigger the logger.exception path."""
        from app.api import integrations as integrations_module

        with patch.object(
            integrations_module.integration_service,
            "handle_gmail_callback",
            new=AsyncMock(side_effect=ValueError("bad state")),
        ):
            with caplog.at_level(logging.ERROR, logger="app.api.integrations"):
                client = self._make_client()
                client.get(
                    "/integrations/gmail/callback",
                    params={"code": "fake-code", "state": "bad-state"},
                    follow_redirects=False,
                )

        error_messages = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
        # ValueError should be handled as 400 without logging the full trace
        assert not any("Gmail OAuth callback failed" in m for m in error_messages), (
            "ValueError should not trigger the exception logger; "
            f"got unexpected log messages: {error_messages}"
        )


# ---------------------------------------------------------------------------
# Service-layer tests
# ---------------------------------------------------------------------------
class TestHandleGmailCallbackServiceLogging:
    """handle_gmail_callback must log at the failure site before re-raising."""

    @pytest.mark.asyncio
    async def test_logs_fetch_token_failure(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """fetch_token() raising triggers logger.exception in the service layer."""
        from app.services.integrations import integration_service

        class _TokenError(Exception):
            pass

        fake_flow = MagicMock()
        fake_flow.fetch_token.side_effect = _TokenError("network timeout")

        with patch.object(integration_service, "_get_flow", return_value=fake_flow):
            with patch.object(
                integration_service,
                "_verify_oauth_state",
                return_value=(str(uuid.uuid4()), str(uuid.uuid4())),
            ):
                with caplog.at_level(
                    logging.ERROR,
                    logger="app.services.integrations.integration_service",
                ):
                    with pytest.raises(_TokenError):
                        await integration_service.handle_gmail_callback(
                            code="code", state="state"
                        )

        error_messages = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
        assert any("fetch_token" in m for m in error_messages), (
            f"Expected fetch_token failure log; got: {error_messages}"
        )

    @pytest.mark.asyncio
    async def test_logs_upsert_failure(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """upsert_gmail() raising triggers logger.exception in the service layer."""
        from app.services.integrations import integration_service

        class _DbError(Exception):
            pass

        fake_creds = MagicMock()
        fake_creds.token = "access-token"
        fake_creds.refresh_token = "refresh-token"
        fake_creds.expiry = None
        fake_creds.scopes = []

        fake_flow = MagicMock()
        fake_flow.credentials = fake_creds

        with patch.object(integration_service, "_get_flow", return_value=fake_flow):
            with patch.object(
                integration_service,
                "_verify_oauth_state",
                return_value=(str(uuid.uuid4()), str(uuid.uuid4())),
            ):
                with patch.object(
                    integration_service.integration_repo,
                    "upsert_gmail",
                    new=AsyncMock(side_effect=_DbError("db unavailable")),
                ):
                    with patch(
                        "app.services.integrations.integration_service.unit_of_work"
                    ) as mock_uow:
                        mock_db = AsyncMock()
                        mock_uow.return_value.__aenter__ = AsyncMock(return_value=mock_db)
                        mock_uow.return_value.__aexit__ = AsyncMock(return_value=False)

                        with caplog.at_level(
                            logging.ERROR,
                            logger="app.services.integrations.integration_service",
                        ):
                            with pytest.raises(_DbError):
                                await integration_service.handle_gmail_callback(
                                    code="code", state="state"
                                )

        error_messages = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
        assert any("upsert" in m.lower() for m in error_messages), (
            f"Expected upsert failure log; got: {error_messages}"
        )
