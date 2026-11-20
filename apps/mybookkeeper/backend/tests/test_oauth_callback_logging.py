"""Tests for Gmail OAuth connect exception logging.

The service (``app/services/integrations/integration_service.py``) logs the full
traceback at each failure site (``fetch_token``, ``upsert_gmail``) before
propagating, so production failures are visible in ``docker logs`` even without
Sentry. The route (``POST /integrations/gmail/complete``) doesn't log them again:
it answers a refusal with its reason, and anything else is a 500. Google
refusing a spent code is a refusal, not a crash.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Iterator
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.auth import current_active_user
from app.core.gmail_connect_failure import GmailConnectFailure
from app.main import app
from app.services.integrations import integration_service
from app.services.integrations.gmail_connect_error import GmailConnectError

COMPLETE = "/integrations/gmail/complete"
_BODY = {"code": "fake-code", "state": "fake-state"}
_USER_ID = uuid.uuid4()


# ---------------------------------------------------------------------------
# Route-layer tests
# ---------------------------------------------------------------------------
@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides[current_active_user] = lambda: SimpleNamespace(id=uuid.uuid4())
    # raise_server_exceptions=False so the TestClient returns a 500 response
    # instead of re-raising the exception in the test process.
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(current_active_user, None)


class TestGmailCompleteRoute:
    """The route answers; the service already logged anything unexpected, once."""

    def test_an_unexpected_exception_is_a_500_not_logged_again(
        self, client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        class _FakeOAuthError(Exception):
            pass

        with patch.object(
            integration_service,
            "complete_gmail_connect",
            new=AsyncMock(side_effect=_FakeOAuthError("token exchange failed")),
        ), caplog.at_level(logging.ERROR, logger="app.api.integrations"):
            response = client.post(COMPLETE, json=_BODY)

        assert response.status_code == 500
        assert not [r for r in caplog.records if r.name == "app.api.integrations" and r.levelno >= logging.ERROR]

    def test_a_refusal_is_a_400_and_not_logged_as_a_crash(
        self, client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        refusal = GmailConnectError(GmailConnectFailure.INVALID_STATE, "Invalid OAuth state")
        with patch.object(
            integration_service, "complete_gmail_connect", new=AsyncMock(side_effect=refusal),
        ), caplog.at_level(logging.ERROR):
            response = client.post(COMPLETE, json=_BODY)

        assert response.status_code == 400
        assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


# ---------------------------------------------------------------------------
# Service-layer tests
# ---------------------------------------------------------------------------
class TestCompleteGmailConnectServiceLogging:
    """complete_gmail_connect must log at the failure site before re-raising."""

    @pytest.mark.asyncio
    async def test_logs_fetch_token_failure(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """fetch_token() raising triggers logger.exception in the service layer."""
        class _TokenError(Exception):
            pass

        fake_flow = MagicMock()
        fake_flow.fetch_token.side_effect = _TokenError("network timeout")

        with patch.object(integration_service, "_get_flow", return_value=fake_flow):
            with patch.object(
                integration_service,
                "_verify_oauth_state",
                return_value=(str(_USER_ID), str(uuid.uuid4()), "test-code-verifier"),
            ):
                with caplog.at_level(
                    logging.ERROR,
                    logger="app.services.integrations.integration_service",
                ):
                    with pytest.raises(_TokenError):
                        await integration_service.complete_gmail_connect(
                            _USER_ID, code="code", state="state"
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
                return_value=(str(_USER_ID), str(uuid.uuid4()), "test-code-verifier"),
            ):
                with patch.object(
                    integration_service.integration_repo,
                    "upsert_gmail",
                    new=AsyncMock(side_effect=_DbError("db unavailable")),
                ), patch.object(
                    integration_service.gmail_mailbox,
                    "address_of_new_connection",
                    new=AsyncMock(return_value="host@gmail.com"),
                ), patch.object(
                    integration_service.organization_repo,
                    "lock_member",
                    new=AsyncMock(return_value=MagicMock(org_role="admin")),
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
                                await integration_service.complete_gmail_connect(
                                    _USER_ID, code="code", state="state"
                                )

        error_messages = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
        assert any("upsert" in m.lower() for m in error_messages), (
            f"Expected upsert failure log; got: {error_messages}"
        )

