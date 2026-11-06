"""Connecting Gmail saves the connection only once its account and refresh token are known."""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.integrations import integration_service


class _ProfileError(Exception):
    pass


@pytest.fixture
def callback() -> Iterator[dict[str, MagicMock]]:
    """Every collaborator of ``handle_gmail_callback`` mocked, around an integration needing reauth."""
    integration = MagicMock(needs_reauth=True)
    creds = MagicMock(
        token="new-access-token",
        refresh_token="new-refresh-token",
        expiry=_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=1),
        scopes={"https://www.googleapis.com/auth/gmail.readonly"},
    )

    @asynccontextmanager
    async def _uow():
        yield MagicMock()

    mocks = {
        "creds": creds,
        "upsert": AsyncMock(return_value=integration),
        "clear": AsyncMock(),
        "address": AsyncMock(return_value="host@gmail.com"),
        "member": AsyncMock(return_value=MagicMock(org_role="admin")),
    }
    with (
        patch.object(integration_service, "unit_of_work", _uow),
        patch.object(integration_service, "_get_flow", return_value=MagicMock(credentials=creds)),
        patch.object(
            integration_service, "_verify_oauth_state",
            return_value=(str(uuid.uuid4()), str(uuid.uuid4()), "test-code-verifier", 0),
        ),
        patch.object(integration_service, "_require_state_outlives_session_cutoff", new=AsyncMock()),
        patch.object(integration_service, "log_auth_event", new=AsyncMock()),
        patch.object(integration_service.integration_repo, "upsert_gmail", new=mocks["upsert"]),
        patch.object(integration_service.integration_repo, "clear_reauth_state", new=mocks["clear"]),
        patch.object(integration_service.gmail_mailbox, "address_of_new_connection", new=mocks["address"]),
        patch.object(integration_service.organization_repo, "lock_member", new=mocks["member"]),
    ):
        yield mocks


@pytest.mark.asyncio
async def test_connect_saves_the_account_address_and_clears_reauth(callback) -> None:
    await integration_service.handle_gmail_callback("oauth-code", "state-jwt")

    assert callback["upsert"].await_args.kwargs["gmail_address"] == "host@gmail.com"
    assert callback["upsert"].await_args.kwargs["refresh_token"] == "new-refresh-token"
    callback["clear"].assert_awaited_once()


@pytest.mark.asyncio
async def test_unreadable_account_saves_nothing(callback) -> None:
    callback["address"].side_effect = _ProfileError("403")

    with pytest.raises(_ProfileError):
        await integration_service.handle_gmail_callback("oauth-code", "state-jwt")

    callback["upsert"].assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("refresh_token", [None, ""])
async def test_missing_refresh_token_saves_nothing(callback, refresh_token) -> None:
    callback["creds"].refresh_token = refresh_token

    with pytest.raises(ValueError, match="refresh token"):
        await integration_service.handle_gmail_callback("oauth-code", "state-jwt")

    callback["address"].assert_not_awaited()
    callback["upsert"].assert_not_awaited()
