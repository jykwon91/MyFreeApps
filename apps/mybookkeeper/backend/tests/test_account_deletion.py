"""Tests for DELETE /users/me (account deletion endpoint).

Tests cover:
- Wrong password → 403
- Wrong email confirmation → 400
- TOTP enabled but code missing → 400
- TOTP enabled but code wrong → 403
- Correct credentials → 204, user row deleted
- Unauthenticated request → 401
"""
import contextlib
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient, Response
from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from platform_shared.services.guard_outcome import GuardOutcome
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import UserManager, current_active_user
from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(
    *,
    email: str = "delete-me@example.com",
    totp_enabled: bool = False,
) -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="$2b$12$fakehashfortestingonly1234",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=totp_enabled,
    )


def _auth_client(user: User, db: AsyncSession):
    """Context manager yielding an AsyncClient signed in as ``user``, on the test's session."""
    @contextlib.asynccontextmanager
    async def _cm():
        app.dependency_overrides[current_active_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
        app.dependency_overrides.clear()

    return _cm


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    """Redirect unit_of_work in the account route to the test DB.

    Mirrors real unit_of_work: flushes changes so they are visible in the same
    session after the context exits (no second session commit needed for tests).
    """
    @asynccontextmanager
    async def _fake_uow():
        yield db
        await db.flush()

    # The shared account-deletion router (audit C1+H9) opens
    # `unit_of_work_factory()` for the cascade. The factory wraps a
    # lambda that re-resolves `unit_of_work` from
    # `app.api.account` at call time, so this patch still takes effect.
    with patch("app.api.account.unit_of_work", _fake_uow):
        yield


# ---------------------------------------------------------------------------
# DELETE /users/me — wrong password
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_delete_requires_correct_password(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    await db.flush()

    with patch("platform_shared.testing.factories._FastPasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (False, None)

        async with _auth_client(user, db)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "wrong-password",
                    "confirm_email": user.email,
                },
            )

    assert response.status_code == 403
    assert response.json()["detail"] == "Incorrect password"


async def _try_to_delete(db: AsyncSession, user: User, *, password_ok: bool, code_ok: bool = True) -> Response:
    with (
        patch("platform_shared.testing.factories._FastPasswordHelper") as helper,
        patch("app.services.user.totp_service.verify_totp_code", new_callable=AsyncMock, return_value=code_ok),
    ):
        helper.return_value.verify_and_update.return_value = (password_ok, None)
        async with _auth_client(user, db)() as client:
            return await client.request(
                "DELETE",
                "/users/me",
                json={"password": "pw", "confirm_email": user.email, "totp_code": "000000"},
            )


@pytest.mark.anyio
async def test_wrong_passwords_lock_the_account_like_wrong_logins(db: AsyncSession) -> None:
    user = _make_user()
    user.failed_login_count = settings.lockout_threshold - 1
    db.add(user)
    await db.flush()

    assert (await _try_to_delete(db, user, password_ok=False)).status_code == 403

    await db.refresh(user)
    assert user.failed_login_count == settings.lockout_threshold
    assert user.locked_until is not None


@pytest.mark.anyio
async def test_wrong_code_counts_toward_the_lockout(db: AsyncSession) -> None:
    user = _make_user(totp_enabled=True)
    db.add(user)
    await db.flush()

    assert (await _try_to_delete(db, user, password_ok=True, code_ok=False)).status_code == 403

    await db.refresh(user)
    assert user.failed_login_count == 1


@pytest.mark.anyio
async def test_locked_account_is_refused_even_with_the_right_password(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    await db.flush()
    guard = MagicMock(begin_attempt=AsyncMock(return_value=GuardOutcome.LOCKED))

    with patch.object(UserManager, "account_guard", new=guard):
        response = await _try_to_delete(db, user, password_ok=True)

    assert response.status_code == 429
    assert response.json()["detail"] == RATE_LIMIT_GENERIC_DETAIL
    assert await db.get(User, user.id) is not None


# ---------------------------------------------------------------------------
# DELETE /users/me — wrong email confirmation
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_delete_requires_email_confirmation(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    await db.flush()

    with patch("platform_shared.testing.factories._FastPasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user, db)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    "confirm_email": "wrong@example.com",
                },
            )

    assert response.status_code == 400
    assert "Email confirmation" in response.json()["detail"]


# ---------------------------------------------------------------------------
# DELETE /users/me — TOTP enabled, code missing
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_delete_requires_totp_when_enabled_missing_code(db: AsyncSession) -> None:
    user = _make_user(totp_enabled=True)
    db.add(user)
    await db.flush()

    with patch("platform_shared.testing.factories._FastPasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user, db)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    "confirm_email": user.email,
                    "totp_code": None,
                },
            )

    assert response.status_code == 400
    assert response.json()["detail"] == "TOTP_CODE_REQUIRED"


# ---------------------------------------------------------------------------
# DELETE /users/me — TOTP enabled, wrong code
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_delete_requires_totp_when_enabled_wrong_code(db: AsyncSession) -> None:
    user = _make_user(totp_enabled=True)
    db.add(user)
    await db.flush()

    with (
        patch("platform_shared.testing.factories._FastPasswordHelper") as mock_helper_cls,
        patch("app.services.user.totp_service.verify_totp_code", new_callable=AsyncMock, return_value=False),
    ):
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user, db)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    "confirm_email": user.email,
                    "totp_code": "000000",
                },
            )

    assert response.status_code == 403
    assert "TOTP" in response.json()["detail"]


# ---------------------------------------------------------------------------
# DELETE /users/me — success, user row deleted
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_delete_succeeds_with_correct_creds(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    await db.flush()

    org = Organization(id=uuid.uuid4(), name="Test Org", created_by=user.id)
    db.add(org)
    await db.flush()

    member = OrganizationMember(organization_id=org.id, user_id=user.id, org_role="owner")
    db.add(member)
    await db.commit()

    # Verify preconditions
    user_row = (await db.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
    assert user_row is not None

    with patch("platform_shared.testing.factories._FastPasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user, db)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    "confirm_email": user.email,
                },
            )

    assert response.status_code == 204

    # User row must be gone — re-query directly to bypass the identity map cache.
    user_after = (
        await db.execute(select(User).where(User.id == user.id).execution_options(populate_existing=True))
    ).scalar_one_or_none()
    assert user_after is None


# ---------------------------------------------------------------------------
# DELETE /users/me — unauthenticated
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_unauthenticated_delete_blocked() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.request(
            "DELETE",
            "/users/me",
            json={
                "password": "any-password",
                "confirm_email": "any@example.com",
            },
        )
    assert response.status_code == 401
