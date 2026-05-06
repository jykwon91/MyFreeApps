"""Platform-invite end-to-end coverage.

Covers the full state machine:
  * admin creates invite (201) → public preview returns email + status
  * non-admin POST /admin/invites → 403
  * duplicate email while a pending invite exists → 409
  * email already a registered user → 409
  * accept with matching email → invite consumed (accepted_at set)
  * accept twice → 409 already accepted
  * accept after expiry → 410 gone
  * accept with wrong logged-in user → 400 email mismatch
  * cancel un-accepted → 204 → re-cancel → 404
  * cancel an accepted invite → 409

The unit-of-work fixture in conftest commits user-factory rows in a
fresh engine, so the `is_verified=True` flip persists across the
service's `unit_of_work` boundary the way it does in production.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _promote_to_admin(email: str) -> None:
    """Flip user's role to admin via a fresh engine.

    Required because the in-test transaction (rolled back at teardown)
    can't be observed by ``unit_of_work`` sessions opened inside the
    service layer — same pattern as the verified flag in user_factory.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as sess:
        async with sess.begin():
            await sess.execute(
                text("UPDATE users SET role = 'admin' WHERE email = :email"),
                {"email": email},
            )
    await engine.dispose()


async def _force_invite_expired(invite_id: str) -> None:
    """Backdate ``expires_at`` so accept-after-expiry is testable."""
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as sess:
        async with sess.begin():
            await sess.execute(
                text(
                    "UPDATE platform_invites "
                    "SET expires_at = :ts WHERE id = :id"
                ),
                {
                    "ts": datetime.now(timezone.utc) - timedelta(hours=1),
                    "id": invite_id,
                },
            )
    await engine.dispose()


async def _delete_invite_rows() -> None:
    """Clean up any platform_invites rows left by tests.

    Tests that create invites via the API persist them outside the
    test's rolled-back transaction (because ``unit_of_work`` opens a
    fresh session). Hard-delete in teardown to keep the test DB clean.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as sess:
        async with sess.begin():
            await sess.execute(text("DELETE FROM platform_invites"))
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_invites():
    yield
    await _delete_invite_rows()


# Auto-stub the email send so console mode dev doesn't litter logs and so
# we can assert it was called with the right shape.
@pytest.fixture
def mock_send_email():
    with patch(
        "app.services.platform.invite_email.send_email_or_raise",
        return_value=None,
    ) as m:
        yield m


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_admin_cannot_create_invite(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    regular = await user_factory()
    async with await as_user(regular) as authed:
        resp = await authed.post(
            "/admin/invites", json={"email": "candidate@example.com"},
        )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_anonymous_cannot_create_invite(
    client: AsyncClient, mock_send_email,
) -> None:
    resp = await client.post(
        "/admin/invites", json={"email": "candidate@example.com"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Create invite
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_creates_invite_returns_201_and_token(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        resp = await authed.post(
            "/admin/invites", json={"email": "newuser@example.com"},
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "newuser@example.com"
    assert body["status"] == "pending"
    assert body["token"]
    assert body["accepted_at"] is None
    assert body["accepted_by"] is None
    # email should have been sent — mocked, so just assert it ran with
    # the expected shape (recipient, subject contains MyJobHunter)
    mock_send_email.assert_called_once()
    args, _ = mock_send_email.call_args
    assert args[0] == ["newuser@example.com"]
    assert "MyJobHunter" in args[1]


@pytest.mark.asyncio
async def test_create_invite_lowercases_email(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        resp = await authed.post(
            "/admin/invites", json={"email": "MixedCase@Example.com"},
        )
    assert resp.status_code == 201
    assert resp.json()["email"] == "mixedcase@example.com"


@pytest.mark.asyncio
async def test_create_invite_for_existing_user_returns_409(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    existing = await user_factory()  # already registered
    async with await as_user(admin) as authed:
        resp = await authed.post(
            "/admin/invites", json={"email": existing["email"]},
        )
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_invite_duplicate_pending_returns_409(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        first = await authed.post(
            "/admin/invites", json={"email": "dupe@example.com"},
        )
        assert first.status_code == 201
        second = await authed.post(
            "/admin/invites", json={"email": "dupe@example.com"},
        )
    assert second.status_code == 409
    assert "pending invite" in second.json()["detail"].lower()


# ---------------------------------------------------------------------------
# List + cancel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_pending_returns_only_unaccepted(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        await authed.post("/admin/invites", json={"email": "a@example.com"})
        await authed.post("/admin/invites", json={"email": "b@example.com"})
        list_resp = await authed.get("/admin/invites")
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert len(data) == 2
    assert {row["email"] for row in data} == {"a@example.com", "b@example.com"}


@pytest.mark.asyncio
async def test_cancel_unaccepted_invite_returns_204(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": "cancelme@example.com"},
        )
        invite_id = create.json()["id"]
        cancel = await authed.delete(f"/admin/invites/{invite_id}")
    assert cancel.status_code == 204


@pytest.mark.asyncio
async def test_cancel_unknown_invite_returns_404(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        resp = await authed.delete(f"/admin/invites/{uuid.uuid4()}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Public preview
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_public_preview_pending(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": "preview@example.com"},
        )
    token = create.json()["token"]

    info = await client.get(f"/invites/{token}/info")
    assert info.status_code == 200
    body = info.json()
    assert body["email"] == "preview@example.com"
    assert body["status"] == "pending"
    # Inviter identity must NOT leak via the public preview.
    assert "created_by" not in body
    assert "inviter_name" not in body


@pytest.mark.asyncio
async def test_public_preview_unknown_token_returns_404(
    client: AsyncClient,
) -> None:
    resp = await client.get("/invites/not-a-real-token/info")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_public_preview_expired_invite(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": "expired@example.com"},
        )
    body = create.json()
    await _force_invite_expired(body["id"])

    info = await client.get(f"/invites/{body['token']}/info")
    assert info.status_code == 200
    assert info.json()["status"] == "expired"


# ---------------------------------------------------------------------------
# Accept
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_accept_invite_with_matching_email(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    invitee_email = f"accept-{uuid.uuid4().hex[:8]}@example.com"
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": invitee_email},
        )
    token = create.json()["token"]
    invite_id = create.json()["id"]

    invitee = await user_factory(email=invitee_email)
    async with await as_user(invitee) as authed_invitee:
        accept = await authed_invitee.post(f"/invites/{token}/accept")
    assert accept.status_code == 200, accept.text
    body = accept.json()
    assert body["invite_id"] == invite_id
    assert body["accepted_at"]


@pytest.mark.asyncio
async def test_accept_invite_email_mismatch_returns_400(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": "intended@example.com"},
        )
    token = create.json()["token"]

    impostor = await user_factory()  # different random email
    async with await as_user(impostor) as authed_impostor:
        resp = await authed_impostor.post(f"/invites/{token}/accept")
    assert resp.status_code == 400
    assert "not for the signed-in account" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_accept_invite_twice_returns_409(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    invitee_email = f"twice-{uuid.uuid4().hex[:8]}@example.com"
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": invitee_email},
        )
    token = create.json()["token"]

    invitee = await user_factory(email=invitee_email)
    async with await as_user(invitee) as authed_invitee:
        first = await authed_invitee.post(f"/invites/{token}/accept")
        second = await authed_invitee.post(f"/invites/{token}/accept")
    assert first.status_code == 200
    assert second.status_code == 409
    assert "already" in second.json()["detail"].lower()


@pytest.mark.asyncio
async def test_accept_expired_invite_returns_410(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    invitee_email = f"expired-{uuid.uuid4().hex[:8]}@example.com"
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": invitee_email},
        )
    create_body = create.json()
    token = create_body["token"]
    await _force_invite_expired(create_body["id"])

    invitee = await user_factory(email=invitee_email)
    async with await as_user(invitee) as authed_invitee:
        resp = await authed_invitee.post(f"/invites/{token}/accept")
    assert resp.status_code == 410


@pytest.mark.asyncio
async def test_accept_unknown_token_returns_404(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        resp = await authed.post("/invites/no-such-token/accept")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_accept_requires_auth(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": "needsauth@example.com"},
        )
    token = create.json()["token"]
    # No auth header
    resp = await client.post(f"/invites/{token}/accept")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_cancel_accepted_invite_returns_409(
    client: AsyncClient, user_factory, as_user, mock_send_email,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    invitee_email = f"acc-cancel-{uuid.uuid4().hex[:8]}@example.com"
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": invitee_email},
        )
    create_body = create.json()
    token = create_body["token"]
    invite_id = create_body["id"]

    invitee = await user_factory(email=invitee_email)
    async with await as_user(invitee) as authed_invitee:
        await authed_invitee.post(f"/invites/{token}/accept")

    async with await as_user(admin) as authed_admin:
        cancel = await authed_admin.delete(f"/admin/invites/{invite_id}")
    assert cancel.status_code == 409


# ---------------------------------------------------------------------------
# Status helper unit test (doesn't need DB)
# ---------------------------------------------------------------------------


def test_compute_status_returns_pending_for_fresh_invite() -> None:
    from app.models.platform.invite import PlatformInvite
    from app.schemas.platform.invite_status import InviteStatus
    from app.services.platform.invite_service import compute_status

    now = datetime.now(timezone.utc)
    invite = PlatformInvite(
        email="x@example.com",
        token="t",
        expires_at=now + timedelta(days=7),
        accepted_at=None,
        created_by=uuid.uuid4(),
    )
    assert compute_status(invite, now=now) == InviteStatus.PENDING


def test_compute_status_returns_accepted_when_accepted_at_set() -> None:
    from app.models.platform.invite import PlatformInvite
    from app.schemas.platform.invite_status import InviteStatus
    from app.services.platform.invite_service import compute_status

    now = datetime.now(timezone.utc)
    invite = PlatformInvite(
        email="x@example.com",
        token="t",
        expires_at=now + timedelta(days=7),
        accepted_at=now,
        created_by=uuid.uuid4(),
    )
    assert compute_status(invite, now=now) == InviteStatus.ACCEPTED


def test_compute_status_returns_expired_past_deadline() -> None:
    from app.models.platform.invite import PlatformInvite
    from app.schemas.platform.invite_status import InviteStatus
    from app.services.platform.invite_service import compute_status

    now = datetime.now(timezone.utc)
    invite = PlatformInvite(
        email="x@example.com",
        token="t",
        expires_at=now - timedelta(seconds=1),
        accepted_at=None,
        created_by=uuid.uuid4(),
    )
    assert compute_status(invite, now=now) == InviteStatus.EXPIRED
