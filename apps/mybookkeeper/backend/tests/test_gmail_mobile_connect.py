"""Connecting Gmail from the phone: the callback sends every outcome to the app's fixed deep link.

The website's connection is unchanged, and the client is only ever read from the
signed state, so a state edited to claim the phone is refused like any bad state.
"""
from __future__ import annotations

import base64
import json
import logging
import uuid
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.context import RequestContext
from app.core.gmail_connect_client import GmailConnectClient
from app.core.gmail_connect_failure import GmailConnectFailure
from app.core.permissions import reject_demo_org_write
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.services.integrations import integration_service
from app.services.integrations.gmail_connect_error import GmailConnectError

CALLBACK = "/integrations/gmail/callback"
CONNECTED = "mybookkeeper://oauth-callback?result=connected"


def _deep_link_error(reason: str) -> str:
    return f"mybookkeeper://oauth-callback?result=error&reason={reason}"


def _state(app_client: GmailConnectClient, **overrides: object) -> str:
    claims: dict[str, object] = {
        "sub": str(uuid.uuid4()),
        "org_id": str(uuid.uuid4()),
        "cv": "verifier",
        "client": app_client.value,
        "type": "oauth_state",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        **overrides,
    }
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, settings.secret_key, algorithm="HS256")


def _with_payload(state: str, **changes: object) -> str:
    """The same token with its claims edited and its signature left as it was."""
    header, payload, signature = state.split(".")
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    claims.update(changes)
    edited = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
    return f"{header}.{edited}.{signature}"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def signed_in() -> Iterator[None]:
    app.dependency_overrides[reject_demo_org_write] = lambda: RequestContext(
        organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
    )
    yield
    app.dependency_overrides.pop(reject_demo_org_write, None)


def _callback(client: TestClient, **params: str) -> object:
    return client.get(CALLBACK, params=params, follow_redirects=False)


class TestConnectRecordsTheClient:
    def _state_claims(self, client: TestClient, query: str = "") -> dict[str, object]:
        response = client.get(f"/integrations/gmail/connect{query}")
        assert response.status_code == 200
        state = parse_qs(urlparse(response.json()["auth_url"]).query)["state"][0]
        return jwt.decode(state, settings.secret_key, algorithms=["HS256"])

    def test_the_phone_is_signed_into_the_state(self, client: TestClient, signed_in: None) -> None:
        assert self._state_claims(client, "?client=mobile")["client"] == "mobile"

    def test_the_website_is_the_default(self, client: TestClient, signed_in: None) -> None:
        assert self._state_claims(client)["client"] == "web"

    def test_a_client_off_the_allowlist_is_refused(self, client: TestClient, signed_in: None) -> None:
        assert client.get("/integrations/gmail/connect?client=https://evil.example").status_code == 422


class TestMobileCallback:
    def test_success_returns_to_the_app(self, client: TestClient) -> None:
        with patch.object(integration_service, "handle_gmail_callback", new=AsyncMock()) as handle:
            response = _callback(client, code="code", state=_state(GmailConnectClient.MOBILE))

        assert response.status_code == 307
        assert response.headers["location"] == CONNECTED
        handle.assert_awaited_once()

    @pytest.mark.parametrize("failure", list(GmailConnectFailure))
    def test_each_refusal_returns_its_reason(
        self, client: TestClient, caplog: pytest.LogCaptureFixture, failure: GmailConnectFailure,
    ) -> None:
        refusal = GmailConnectError(failure, "a developer's message")
        with (
            patch.object(integration_service, "handle_gmail_callback", new=AsyncMock(side_effect=refusal)),
            caplog.at_level(logging.WARNING),
        ):
            response = _callback(client, code="code", state=_state(GmailConnectClient.MOBILE))

        assert response.status_code == 307
        assert response.headers["location"] == _deep_link_error(failure.value)
        assert any(f"reason={failure.value}" in record.getMessage() for record in caplog.records)

    def test_declining_at_google_says_so(self, client: TestClient) -> None:
        with patch.object(integration_service, "handle_gmail_callback", new=AsyncMock()) as handle:
            response = _callback(client, error="access_denied", state=_state(GmailConnectClient.MOBILE))

        assert response.headers["location"] == _deep_link_error("denied")
        handle.assert_not_awaited()

    @pytest.mark.parametrize("params", [{"error": "server_error"}, {}], ids=["google error", "no code"])
    def test_any_other_google_answer_without_a_code_failed(self, client: TestClient, params: dict[str, str]) -> None:
        response = _callback(client, state=_state(GmailConnectClient.MOBILE), **params)

        assert response.headers["location"] == _deep_link_error("failed")

    def test_a_state_that_ran_out_is_expired(self, client: TestClient) -> None:
        late = _state(GmailConnectClient.MOBILE, exp=datetime.now(timezone.utc) - timedelta(minutes=1))
        with patch.object(integration_service, "_get_flow") as get_flow:
            response = _callback(client, code="code", state=late)

        assert response.headers["location"] == _deep_link_error("expired")
        get_flow.assert_not_called()

    def test_a_state_without_its_verifier_is_invalid(self, client: TestClient) -> None:
        response = _callback(client, code="code", state=_state(GmailConnectClient.MOBILE, cv=None))

        assert response.headers["location"] == _deep_link_error("invalid_state")

    def test_a_crash_returns_failed_and_is_logged(self, client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
        crash = RuntimeError("token exchange blew up")
        with (
            patch.object(integration_service, "handle_gmail_callback", new=AsyncMock(side_effect=crash)),
            caplog.at_level(logging.ERROR),
        ):
            response = _callback(client, code="code", state=_state(GmailConnectClient.MOBILE))

        assert response.headers["location"] == _deep_link_error("failed")
        assert any(record.exc_info and record.exc_info[1] is crash for record in caplog.records)

    def test_the_destination_is_never_taken_from_the_request(self, client: TestClient) -> None:
        with patch.object(integration_service, "handle_gmail_callback", new=AsyncMock()):
            response = _callback(
                client, code="code", state=_state(GmailConnectClient.MOBILE),
                redirect_uri="https://evil.example", return_to="https://evil.example",
            )

        assert response.headers["location"] == CONNECTED


class TestWebCallbackUnchanged:
    def test_success_goes_to_the_website(self, client: TestClient) -> None:
        with patch.object(integration_service, "handle_gmail_callback", new=AsyncMock()):
            response = _callback(client, code="code", state=_state(GmailConnectClient.WEB))

        assert response.headers["location"] == f"{settings.frontend_url}/oauth-callback"

    def test_a_refusal_is_still_a_400_with_its_message(self, client: TestClient) -> None:
        refusal = GmailConnectError(GmailConnectFailure.NO_REFRESH_TOKEN, "Google didn't return a refresh token.")
        with patch.object(integration_service, "handle_gmail_callback", new=AsyncMock(side_effect=refusal)):
            response = _callback(client, code="code", state=_state(GmailConnectClient.WEB))

        assert response.status_code == 400
        assert response.json()["detail"] == "Google didn't return a refresh token."

    def test_a_state_from_before_the_client_claim_is_the_websites(self, client: TestClient) -> None:
        legacy = _state(GmailConnectClient.WEB, client=None)
        with patch.object(integration_service, "handle_gmail_callback", new=AsyncMock()):
            response = _callback(client, code="code", state=legacy)

        assert response.headers["location"] == f"{settings.frontend_url}/oauth-callback"

    def test_an_expired_state_is_still_a_400(self, client: TestClient) -> None:
        late = _state(GmailConnectClient.WEB, exp=datetime.now(timezone.utc) - timedelta(minutes=1))
        response = _callback(client, code="code", state=late)

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid or expired OAuth state"


class TestTamperedClient:
    def test_a_website_state_edited_to_claim_the_phone_is_refused(self, client: TestClient) -> None:
        tampered = _with_payload(_state(GmailConnectClient.WEB), client="mobile")
        with patch.object(integration_service, "_get_flow") as get_flow:
            response = _callback(client, code="code", state=tampered)

        assert response.status_code == 400
        assert "location" not in response.headers
        get_flow.assert_not_called()

    def test_a_state_signed_with_another_key_is_refused(self, client: TestClient) -> None:
        forged = jwt.encode(
            {"sub": "u", "org_id": "o", "cv": "v", "client": "mobile", "type": "oauth_state",
             "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
            "not-the-server-key-but-just-as-long-as-one", algorithm="HS256",
        )
        response = _callback(client, code="code", state=forged)

        assert response.status_code == 400
        assert "location" not in response.headers

    def test_a_signed_state_naming_another_client_is_invalid(self, client: TestClient) -> None:
        odd = jwt.encode(
            {"sub": str(uuid.uuid4()), "org_id": str(uuid.uuid4()), "cv": "v", "client": "desktop",
             "type": "oauth_state", "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
            settings.secret_key, algorithm="HS256",
        )
        with patch.object(integration_service, "_get_flow") as get_flow:
            response = _callback(client, code="code", state=odd)

        assert response.status_code == 400
        get_flow.assert_not_called()


@pytest.mark.asyncio
async def test_the_refusal_carries_its_reason_for_the_service_callers() -> None:
    with pytest.raises(GmailConnectError) as refused:
        await integration_service.handle_gmail_callback("code", _state(GmailConnectClient.MOBILE, cv=None))

    assert refused.value.failure is GmailConnectFailure.INVALID_STATE
    assert isinstance(refused.value, ValueError)


def test_only_a_signed_state_naming_the_phone_is_the_phones() -> None:
    assert integration_service.gmail_connect_client(_state(GmailConnectClient.MOBILE)) is GmailConnectClient.MOBILE
    assert integration_service.gmail_connect_client(_state(GmailConnectClient.WEB)) is GmailConnectClient.WEB
    assert integration_service.gmail_connect_client("not-a-jwt") is GmailConnectClient.WEB
