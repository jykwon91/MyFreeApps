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
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property
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


def _auth_client(user: User):
    """Context manager yielding an AsyncClient with current_active_user overridden."""
    @contextlib.asynccontextmanager
    async def _cm():
        app.dependency_overrides[current_active_user] = lambda: user
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

    with patch("app.api.account.PasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (False, None)

        async with _auth_client(user)() as client:
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


# ---------------------------------------------------------------------------
# DELETE /users/me — wrong email confirmation
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_delete_requires_email_confirmation(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    await db.flush()

    with patch("app.api.account.PasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
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

    with patch("app.api.account.PasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
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
        patch("app.api.account.PasswordHelper") as mock_helper_cls,
        patch("app.api.account.validate_totp_for_login", new_callable=AsyncMock, return_value=(False, False)),
    ):
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
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

    with patch("app.api.account.PasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
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
