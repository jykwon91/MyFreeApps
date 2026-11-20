"""A Gmail connection only completes for the signed-in person who started it.

The signed state proves this server issued it, not that whoever completes Google's
consent is the person it was issued to. Without that check, someone could start
a connection, send Google's consent link to anyone, and have that person's Gmail
(read and send) land in their own workspace. POST /integrations/gmail/complete
is signed in, and refuses any state issued to someone else before reaching Google.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient
from oauthlib.oauth2.rfc6749.errors import InvalidGrantError

from app.core.auth import current_active_user
from app.core.config import settings
from app.core.gmail_connect_client import GmailConnectClient
from app.core.gmail_connect_failure import GmailConnectFailure
from app.main import app
from app.services.integrations import integration_service
from app.services.integrations.gmail_connect_error import GmailConnectError

COMPLETE = "/integrations/gmail/complete"
STARTER = uuid.uuid4()
WORKSPACE = uuid.uuid4()


def _state(user_id: uuid.UUID = STARTER, client: GmailConnectClient = GmailConnectClient.WEB) -> str:
    return integration_service._create_oauth_state(str(user_id), str(WORKSPACE), "verifier", client=client)


@pytest.fixture
def client() -> Iterator[TestClient]:
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(current_active_user, None)


def _signed_in_as(user_id: uuid.UUID) -> None:
    app.dependency_overrides[current_active_user] = lambda: SimpleNamespace(id=user_id)


@pytest.fixture
def google() -> Iterator[dict[str, Any]]:
    """Google's side and the save mocked, so a test sees whether it got that far."""
    creds = MagicMock(
        token="ya29.new",
        refresh_token="rt-new",
        expiry=_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=1),
        scopes={"https://www.googleapis.com/auth/gmail.readonly"},
    )
    flow = MagicMock(credentials=creds)

    @asynccontextmanager
    async def _uow():
        yield MagicMock()

    mocks: dict[str, Any] = {
        "get_flow": MagicMock(return_value=flow),
        "flow": flow,
        "upsert": AsyncMock(return_value=MagicMock()),
        "member": AsyncMock(return_value=MagicMock(org_role="admin")),
    }
    with (
        patch.object(integration_service, "_get_flow", new=mocks["get_flow"]),
        patch.object(integration_service, "unit_of_work", _uow),
        patch.object(integration_service, "log_auth_event", new=AsyncMock()),
        patch.object(integration_service.integration_repo, "upsert_gmail", new=mocks["upsert"]),
        patch.object(integration_service.integration_repo, "clear_reauth_state", new=AsyncMock()),
        patch.object(integration_service.organization_repo, "lock_member", new=mocks["member"]),
        patch.object(
            integration_service.gmail_mailbox, "address_of_new_connection",
            new=AsyncMock(return_value="host@gmail.com"),
        ),
    ):
        yield mocks


def _never_reached_google(google: dict[str, Any]) -> None:
    google["get_flow"].assert_not_called()
    google["upsert"].assert_not_awaited()


@pytest.mark.parametrize("app_client", list(GmailConnectClient))
def test_the_person_who_started_it_connects_their_gmail(
    client: TestClient, google: dict[str, Any], app_client: GmailConnectClient,
) -> None:
    _signed_in_as(STARTER)

    response = client.post(COMPLETE, json={"code": "code", "state": _state(client=app_client)})

    assert response.status_code == 204
    google["flow"].fetch_token.assert_called_once_with(code="code")
    assert google["flow"].code_verifier == "verifier"
    saved = google["upsert"].await_args.kwargs
    assert (saved["user_id"], saved["organization_id"]) == (STARTER, WORKSPACE)


@pytest.mark.parametrize("app_client", list(GmailConnectClient))
def test_someone_else_finishing_it_is_refused_and_saves_nothing(
    client: TestClient, google: dict[str, Any], app_client: GmailConnectClient,
) -> None:
    _signed_in_as(uuid.uuid4())

    response = client.post(COMPLETE, json={"code": "code", "state": _state(client=app_client)})

    assert response.status_code == 403
    assert response.json()["detail"] == GmailConnectFailure.WRONG_ACCOUNT.value
    _never_reached_google(google)


def test_no_one_signed_in_can_finish_it(client: TestClient, google: dict[str, Any]) -> None:
    response = client.post(COMPLETE, json={"code": "code", "state": _state()})

    assert response.status_code == 401
    _never_reached_google(google)


def test_a_state_edited_to_name_the_person_finishing_it_is_refused(
    client: TestClient, google: dict[str, Any],
) -> None:
    intruder = uuid.uuid4()
    _signed_in_as(intruder)
    header, _, signature = _state().split(".")
    _, payload, _ = _state(user_id=intruder).split(".")

    response = client.post(COMPLETE, json={"code": "code", "state": f"{header}.{payload}.{signature}"})

    assert response.status_code == 400
    assert response.json()["detail"] == GmailConnectFailure.INVALID_STATE.value
    _never_reached_google(google)


def test_a_state_that_ran_out_is_expired(client: TestClient, google: dict[str, Any]) -> None:
    _signed_in_as(STARTER)
    late = jwt.encode(
        {"sub": str(STARTER), "org_id": str(WORKSPACE), "cv": "v", "client": "web", "type": "oauth_state",
         "exp": _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(minutes=1)},
        settings.secret_key, algorithm="HS256",
    )

    response = client.post(COMPLETE, json={"code": "code", "state": late})

    assert response.status_code == 400
    assert response.json()["detail"] == GmailConnectFailure.EXPIRED.value
    _never_reached_google(google)


def test_a_state_without_its_verifier_is_invalid(client: TestClient, google: dict[str, Any]) -> None:
    _signed_in_as(STARTER)
    no_verifier = integration_service._create_oauth_state(
        str(STARTER), str(WORKSPACE), "", client=GmailConnectClient.WEB,
    )

    response = client.post(COMPLETE, json={"code": "code", "state": no_verifier})

    assert response.json()["detail"] == GmailConnectFailure.INVALID_STATE.value
    _never_reached_google(google)


def test_a_spent_code_sent_again_is_expired_not_a_crash(
    client: TestClient, google: dict[str, Any], caplog: pytest.LogCaptureFixture,
) -> None:
    """Reloading the popup after it finished sends Google's code again, which Google refuses."""
    _signed_in_as(STARTER)
    google["flow"].fetch_token.side_effect = InvalidGrantError(description="Bad Request")

    with caplog.at_level(logging.WARNING):
        response = client.post(COMPLETE, json={"code": "code", "state": _state()})

    assert response.status_code == 400
    assert response.json()["detail"] == GmailConnectFailure.EXPIRED.value
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]
    google["upsert"].assert_not_awaited()


def test_losing_access_since_starting_it_is_not_allowed(client: TestClient, google: dict[str, Any]) -> None:
    _signed_in_as(STARTER)
    google["member"].return_value = None

    response = client.post(COMPLETE, json={"code": "code", "state": _state()})

    assert response.status_code == 403
    assert response.json()["detail"] == GmailConnectFailure.NOT_ALLOWED.value
    google["upsert"].assert_not_awaited()


@pytest.mark.parametrize("failure", list(GmailConnectFailure))
def test_each_refusal_answers_with_its_reason(client: TestClient, failure: GmailConnectFailure) -> None:
    _signed_in_as(STARTER)
    refusal = GmailConnectError(failure, "a developer's message")
    with patch.object(integration_service, "complete_gmail_connect", new=AsyncMock(side_effect=refusal)):
        response = client.post(COMPLETE, json={"code": "code", "state": "state"})

    expected = 403 if failure in {GmailConnectFailure.NOT_ALLOWED, GmailConnectFailure.WRONG_ACCOUNT} else 400
    assert (response.status_code, response.json()["detail"]) == (expected, failure.value)


@pytest.mark.parametrize(
    "body",
    [{"code": "", "state": "s"}, {"code": "c", "state": "s" * 5000}, {"code": "c", "state": "s", "user_id": "x"}],
    ids=["empty code", "oversized state", "extra field"],
)
def test_a_malformed_body_is_refused(client: TestClient, google: dict[str, Any], body: dict[str, str]) -> None:
    _signed_in_as(STARTER)

    assert client.post(COMPLETE, json=body).status_code == 422
    _never_reached_google(google)


def test_the_state_carries_no_more_than_the_connection_needs() -> None:
    claims = jwt.decode(_state(), settings.secret_key, algorithms=["HS256"])

    assert set(claims) == {"sub", "org_id", "client", "cv", "type", "exp"}
