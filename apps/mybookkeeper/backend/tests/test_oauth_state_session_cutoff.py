"""A Gmail connection started before a password change can't finish after it.

The callback has no signed-in user, so the signed state is the only thing tying
it to a session, and it must end when that session does.
"""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.integrations import integration_service


async def _run_callback(user: SimpleNamespace | None, flow: MagicMock) -> None:
    state = integration_service._create_oauth_state(str(uuid.uuid4()), str(uuid.uuid4()), "verifier")
    with (
        patch.object(integration_service, "AsyncSessionLocal", return_value=AsyncMock()),
        patch.object(integration_service.user_repo, "get_by_id", new=AsyncMock(return_value=user)),
        patch.object(integration_service, "_get_flow", return_value=flow),
    ):
        await integration_service.handle_gmail_callback(code="code", state=state)


@pytest.mark.asyncio
async def test_state_from_before_a_password_change_never_reaches_google() -> None:
    flow = MagicMock()
    cutoff = datetime.now(timezone.utc) + timedelta(minutes=1)

    with pytest.raises(ValueError, match="password change"):
        await _run_callback(SimpleNamespace(auth_valid_after=cutoff), flow)

    flow.fetch_token.assert_not_called()


@pytest.mark.asyncio
async def test_state_for_a_deleted_user_never_reaches_google() -> None:
    flow = MagicMock()

    with pytest.raises(ValueError, match="Invalid OAuth state"):
        await _run_callback(None, flow)

    flow.fetch_token.assert_not_called()


@pytest.mark.parametrize(
    "cutoff",
    [None, datetime.now(timezone.utc) - timedelta(days=1)],
    ids=["no password change", "password changed earlier"],
)
@pytest.mark.asyncio
async def test_state_newer_than_the_cutoff_goes_on_to_google(cutoff: datetime | None) -> None:
    flow = MagicMock()
    flow.fetch_token.side_effect = RuntimeError("stop before the database write")

    with pytest.raises(RuntimeError, match="stop before"):
        await _run_callback(SimpleNamespace(auth_valid_after=cutoff), flow)

    flow.fetch_token.assert_called_once()
