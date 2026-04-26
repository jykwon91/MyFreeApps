"""Integration tests for auth event logging across full request flows.

Each test exercises a real code path (mocking only auth/DB plumbing) and
asserts that the correct AuthEvent row is written.
"""
import contextlib
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.main import app
from app.models.system.auth_event import AuthEvent
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(
    *,
    email: str = "test@example.com",
    is_verified: bool = True,
    totp_enabled: bool = False,
    locked_until=None,
) -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="$2b$12$fakehashfortestingonly1234",
        is_active=True,
        is_superuser=False,
        is_verified=is_verified,
        totp_enabled=totp_enabled,
        locked_until=locked_until,
        failed_login_count=0,
    )


def _auth_client(user: User):
    @contextlib.asynccontextmanager
    async def _cm():
        app.dependency_overrides[current_active_user] = lambda: user
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
        app.dependency_overrides.pop(current_active_user, None)
    return _cm


@pytest.fixture(autouse=True)
def _route_db(db: AsyncSession):
    """Redirect get_db in all routes to the test DB."""
    async def _fake_get_db():
        yield db

    app.dependency_overrides[get_db] = _fake_get_db
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture(autouse=True)
def _patch_totp_service(db: AsyncSession):
    """Redirect totp_service sessions to the test DB."""
    @asynccontextmanager
    async def _fake_session():
        yield db

    with (
        patch("app.services.user.totp_service.unit_of_work", _fake_session),
        patch("app.services.user.totp_service.AsyncSessionLocal", _fake_session),
    ):
        yield


async def _events(db: AsyncSession) -> list[AuthEvent]:
    return list((await db.execute(select(AuthEvent))).scalars().all())


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_register_creates_event(db: AsyncSession) -> None:
    """Successful registration logs REGISTER_SUCCESS."""
    from app.core.rate_limit import check_register_rate_limit

    # Bypass rate limiter and Turnstile for the test
    app.dependency_overrides[check_register_rate_limit] = lambda: None

    try:
        with (
            patch("app.core.auth.send_verification_email", return_value=True),
            patch("app.core.auth.is_password_pwned", new_callable=AsyncMock, return_value=False),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/register",
                    json={"email": "newuser@example.com", "password": "StrongPass123!"},
                )
    finally:
        app.dependency_overrides.pop(check_register_rate_limit, None)

    assert resp.status_code == 201

    events = await _events(db)
    event_types = {e.event_type for e in events}
    assert "register.success" in event_types
    reg_event = next(e for e in events if e.event_type == "register.success")
    assert reg_event.succeeded is True
    assert reg_event.user_id is not None


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_email_verify_resend_creates_event(db: AsyncSession) -> None:
    """Requesting a new verification token logs EMAIL_VERIFY_RESEND."""
    user = _make_user(is_verified=False)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    with patch("app.core.auth.send_verification_email", return_value=True):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/auth/request-verify-token",
                json={"email": user.email},
            )

    assert resp.status_code == 202

    events = await _events(db)
    event_types = {e.event_type for e in events}
    assert "email_verify.resend" in event_types


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_password_reset_request_creates_event(db: AsyncSession) -> None:
    """forgot-password call logs PASSWORD_RESET_REQUEST."""
    user = _make_user()
    db.add(user)
    await db.commit()
    await db.refresh(user)

    with (
        patch("app.core.auth.send_password_reset_email", return_value=True),
        patch("app.core.rate_limit.verify_turnstile_token", new_callable=AsyncMock, return_value=True),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/auth/forgot-password",
                json={"email": user.email},
            )

    assert resp.status_code == 202

    events = await _events(db)
    event_types = {e.event_type for e in events}
    assert "password_reset.request" in event_types
    ev = next(e for e in events if e.event_type == "password_reset.request")
    assert ev.user_id == user.id


# ---------------------------------------------------------------------------
# TOTP enable
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_totp_enable_creates_event(db: AsyncSession) -> None:
    """Completing TOTP setup (verify endpoint) logs TOTP_ENABLED."""
    import pyotp
    from app.services.user.totp_service import _encrypt

    user = _make_user(totp_enabled=False)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    secret = pyotp.random_base32()
    user.totp_secret = _encrypt(secret, user.id)
    await db.commit()

    code = pyotp.TOTP(secret).now()

    async with _auth_client(user)() as client:
        resp = await client.post("/auth/totp/verify", json={"code": code})

    assert resp.status_code == 200
    assert resp.json()["verified"] is True

    events = await _events(db)
    event_types = {e.event_type for e in events}
    assert "totp.enabled" in event_types
    ev = next(e for e in events if e.event_type == "totp.enabled")
    assert ev.user_id == user.id
    assert ev.succeeded is True


# ---------------------------------------------------------------------------
# TOTP login — success and failure
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_totp_login_success_creates_event(db: AsyncSession) -> None:
    """Successful TOTP login logs LOGIN_SUCCESS."""
    from app.core.rate_limit import check_login_rate_limit, check_totp_rate_limit

    user = _make_user(totp_enabled=False)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    app.dependency_overrides[check_login_rate_limit] = lambda: None
    app.dependency_overrides[check_totp_rate_limit] = lambda: None
    try:
        with patch(
            "app.api.totp.UserManager.authenticate_password",
            new_callable=AsyncMock,
            return_value=user,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/totp/login",
                    json={"email": user.email, "password": "correct"},
                )
    finally:
        app.dependency_overrides.pop(check_login_rate_limit, None)
        app.dependency_overrides.pop(check_totp_rate_limit, None)

    assert resp.status_code == 200
    assert "access_token" in resp.json()

    events = await _events(db)
    assert any(e.event_type == "login.success" for e in events)
    ev = next(e for e in events if e.event_type == "login.success")
    assert ev.user_id == user.id
    assert ev.succeeded is True


@pytest.mark.anyio
async def test_totp_login_failure_creates_event(db: AsyncSession) -> None:
    """Failed authentication (bad credentials) logs LOGIN_FAILURE."""
    from app.core.rate_limit import check_login_rate_limit, check_totp_rate_limit

    app.dependency_overrides[check_login_rate_limit] = lambda: None
    app.dependency_overrides[check_totp_rate_limit] = lambda: None
    try:
        with patch(
            "app.api.totp.UserManager.authenticate_password",
            new_callable=AsyncMock,
            return_value=None,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/auth/totp/login",
                    json={"email": "nobody@example.com", "password": "wrong"},
                )
    finally:
        app.dependency_overrides.pop(check_login_rate_limit, None)
        app.dependency_overrides.pop(check_totp_rate_limit, None)

    assert resp.status_code == 400

    events = await _events(db)
    assert any(e.event_type == "login.failure" and not e.succeeded for e in events)


# ---------------------------------------------------------------------------
# Account deletion
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_account_delete_creates_event(db: AsyncSession) -> None:
    """Account deletion logs ACCOUNT_DELETED before the cascade."""
    user = _make_user()
    db.add(user)
    await db.commit()
    await db.refresh(user)

    @asynccontextmanager
    async def _fake_uow():
        yield db
        await db.flush()

    with (
        patch("app.api.account.unit_of_work", _fake_uow),
        patch("app.api.account.PasswordHelper") as mock_helper_cls,
    ):
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
            resp = await client.request(
                "DELETE",
                "/users/me",
                json={"password": "correct", "confirm_email": user.email},
            )

    assert resp.status_code == 204

    # The event must have been written (it survives even though the user is deleted
    # because there's no FK constraint on auth_events.user_id).
    events = await _events(db)
    assert any(e.event_type == "account.deleted" for e in events)
    ev = next(e for e in events if e.event_type == "account.deleted")
    assert ev.user_id == user.id
    assert ev.succeeded is True


# ---------------------------------------------------------------------------
# Data export
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_data_export_creates_event(db: AsyncSession) -> None:
    """Data export logs DATA_EXPORTED."""
    from app.core.context import RequestContext
    from app.core.permissions import current_org_member
    from app.models.organization.organization_member import OrgRole

    user = _make_user()
    db.add(user)
    await db.commit()
    await db.refresh(user)

    org_id = uuid.uuid4()
    ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)
    app.dependency_overrides[current_org_member] = lambda: ctx

    with (
        patch("app.services.user.account_service.property_repo.list_by_org", new_callable=AsyncMock, return_value=[]),
        patch("app.services.user.account_service.document_repo.list_by_user", new_callable=AsyncMock, return_value=[]),
        patch("app.services.user.account_service.transaction_repo.list_by_user", new_callable=AsyncMock, return_value=[]),
        patch("app.services.user.account_service.integration_repo.list_by_org", new_callable=AsyncMock, return_value=[]),
    ):
        async with _auth_client(user)() as client:
            resp = await client.get("/users/me/export")

    app.dependency_overrides.pop(current_org_member, None)

    assert resp.status_code == 200

    events = await _events(db)
    assert any(e.event_type == "data.exported" for e in events)
    ev = next(e for e in events if e.event_type == "data.exported")
    assert ev.user_id == user.id
    assert ev.succeeded is True
