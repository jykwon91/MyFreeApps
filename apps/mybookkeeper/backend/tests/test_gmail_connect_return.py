"""Google's callback finishes nothing: it sends the answer on to the app that started it.

Google's redirect carries no sign-in, so the callback can't know who completed
consent. It forwards the code and state to the fixed address of the app named in
the signed state, and that app finishes the connection signed in. The client is
only ever read from the signed state, never from the request.
"""
from __future__ import annotations

import base64
import json
import uuid
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlencode, urlparse

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.context import RequestContext
from app.core.gmail_connect_client import GmailConnectClient
from app.core.permissions import reject_demo_org_write
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.services.integrations import integration_service

CALLBACK = "/integrations/gmail/callback"
MOBILE_RETURN = "mybookkeeper://oauth-callback"
WEB_RETURN = f"{settings.frontend_url}/oauth-callback"


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


def _forwarded(base: str, state: str) -> str:
    return f"{base}?{urlencode({'code': 'code', 'state': state})}"


def _ended(base: str, reason: str) -> str:
    return f"{base}?result=error&reason={reason}"


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


@pytest.fixture
def never_finishes() -> Iterator[AsyncMock]:
    """The callback must never exchange the code or save anything itself."""
    with (
        patch.object(integration_service, "_get_flow") as get_flow,
        patch.object(integration_service, "complete_gmail_connect", new=AsyncMock()) as complete,
    ):
        yield complete
        get_flow.assert_not_called()
        complete.assert_not_awaited()


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


@pytest.mark.parametrize(
    ("app_client", "base"),
    [(GmailConnectClient.MOBILE, MOBILE_RETURN), (GmailConnectClient.WEB, WEB_RETURN)],
    ids=["phone", "website"],
)
class TestCallbackForwards:
    def test_the_code_and_state_go_back_to_the_app_that_started_it(
        self, client: TestClient, never_finishes: AsyncMock, app_client: GmailConnectClient, base: str,
    ) -> None:
        state = _state(app_client)
        response = _callback(client, code="code", state=state)

        assert response.status_code == 307
        assert response.headers["location"] == _forwarded(base, state)

    def test_declining_at_google_says_so(
        self, client: TestClient, never_finishes: AsyncMock, app_client: GmailConnectClient, base: str,
    ) -> None:
        response = _callback(client, error="access_denied", state=_state(app_client))

        assert response.headers["location"] == _ended(base, "denied")

    @pytest.mark.parametrize("params", [{"error": "server_error"}, {}], ids=["google error", "no code"])
    def test_any_other_google_answer_without_a_code_failed(
        self, client: TestClient, never_finishes: AsyncMock, app_client: GmailConnectClient, base: str,
        params: dict[str, str],
    ) -> None:
        response = _callback(client, state=_state(app_client), **params)

        assert response.headers["location"] == _ended(base, "failed")

    def test_a_state_that_ran_out_still_goes_back_to_its_app(
        self, client: TestClient, never_finishes: AsyncMock, app_client: GmailConnectClient, base: str,
    ) -> None:
        late = _state(app_client, exp=datetime.now(timezone.utc) - timedelta(minutes=1))
        response = _callback(client, code="code", state=late)

        assert response.headers["location"] == _forwarded(base, late)

    def test_the_destination_is_never_taken_from_the_request(
        self, client: TestClient, never_finishes: AsyncMock, app_client: GmailConnectClient, base: str,
    ) -> None:
        state = _state(app_client)
        response = _callback(
            client, code="code", state=state,
            redirect_uri="https://evil.example", return_to="https://evil.example",
        )

        assert response.headers["location"] == _forwarded(base, state)


class TestTamperedClient:
    def test_a_website_state_edited_to_claim_the_phone_goes_to_the_website(
        self, client: TestClient, never_finishes: AsyncMock,
    ) -> None:
        tampered = _with_payload(_state(GmailConnectClient.WEB), client="mobile")
        response = _callback(client, code="code", state=tampered)

        assert response.headers["location"] == _forwarded(WEB_RETURN, tampered)

    def test_a_state_signed_with_another_key_goes_to_the_website(
        self, client: TestClient, never_finishes: AsyncMock,
    ) -> None:
        forged = jwt.encode(
            {"sub": "u", "org_id": "o", "cv": "v", "client": "mobile", "type": "oauth_state",
             "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
            "not-the-server-key-but-just-as-long-as-one", algorithm="HS256",
        )
        response = _callback(client, code="code", state=forged)

        assert response.headers["location"].startswith(f"{WEB_RETURN}?")


def test_only_a_signed_state_naming_the_phone_is_the_phones() -> None:
    assert integration_service.gmail_connect_client(_state(GmailConnectClient.MOBILE)) is GmailConnectClient.MOBILE
    assert integration_service.gmail_connect_client(_state(GmailConnectClient.WEB)) is GmailConnectClient.WEB
    assert integration_service.gmail_connect_client(_state(GmailConnectClient.WEB, client=None)) is GmailConnectClient.WEB
    assert integration_service.gmail_connect_client("not-a-jwt") is GmailConnectClient.WEB
