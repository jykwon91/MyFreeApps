"""Tests for the admin demo-management API.

Covers the full CRUD shape:
  - create returns plaintext credentials and seeded data
  - list returns just the demo user, never real users
  - delete cascades cleanly and refuses real users
  - email collision returns 409
  - non-admin caller is rejected with 403

The service uses ``unit_of_work`` (its own session) for atomicity, so
the conftest's rolled-back transaction does NOT cover writes the
service makes. Cleanup is explicit at the end of each test via
``DELETE FROM users WHERE email LIKE '%demo+%'`` so no demo rows
persist across the test session.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.main import app
from app.services.demo import demo_service


pytestmark = pytest.mark.asyncio


async def _purge_demo_users() -> None:
    """Hard-clean every demo user out of the DB."""
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as sess:
            async with sess.begin():
                await sess.execute(text("DELETE FROM users WHERE is_demo = TRUE"))
                await sess.execute(
                    text("DELETE FROM auth_events WHERE user_id IS NULL")
                )
    finally:
        await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_demo_users():
    """Each demo test starts and ends with zero demo rows."""
    await _purge_demo_users()
    yield
    await _purge_demo_users()


# ---------------------------------------------------------------------------
# Service-layer tests (no HTTP)
# ---------------------------------------------------------------------------


async def test_create_demo_user_returns_credentials_and_seeds_data() -> None:
    """``create_demo_user`` writes a real user, profile, and applications."""
    response = await demo_service.create_demo_user()

    assert response.credentials.email.endswith("@myjobhunter-demo.example.com")
    assert len(response.credentials.password) >= 16
    assert response.user_id is not None

    # Verify the seed data landed in the DB.
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as sess:
            async with sess.begin():
                user_row = await sess.execute(
                    text(
                        "SELECT is_demo, is_verified, display_name "
                        "FROM users WHERE id = :id"
                    ),
                    {"id": response.user_id},
                )
                user = user_row.first()
                assert user is not None
                assert user.is_demo is True
                assert user.is_verified is True
                assert user.display_name == "Alex Demo"

                profile_row = await sess.execute(
                    text("SELECT COUNT(*) FROM profiles WHERE user_id = :id"),
                    {"id": response.user_id},
                )
                assert profile_row.scalar_one() == 1

                wh_row = await sess.execute(
                    text(
                        "SELECT COUNT(*) FROM work_history WHERE user_id = :id"
                    ),
                    {"id": response.user_id},
                )
                assert wh_row.scalar_one() == 3

                edu_row = await sess.execute(
                    text("SELECT COUNT(*) FROM education WHERE user_id = :id"),
                    {"id": response.user_id},
                )
                assert edu_row.scalar_one() == 1

                skill_row = await sess.execute(
                    text("SELECT COUNT(*) FROM skills WHERE user_id = :id"),
                    {"id": response.user_id},
                )
                assert skill_row.scalar_one() == 8

                co_row = await sess.execute(
                    text(
                        "SELECT COUNT(*) FROM companies WHERE user_id = :id"
                    ),
                    {"id": response.user_id},
                )
                assert co_row.scalar_one() == 3

                app_row = await sess.execute(
                    text(
                        "SELECT COUNT(*) FROM applications "
                        "WHERE user_id = :id AND deleted_at IS NULL"
                    ),
                    {"id": response.user_id},
                )
                assert app_row.scalar_one() == 4

                event_row = await sess.execute(
                    text(
                        "SELECT COUNT(*) FROM application_events "
                        "WHERE user_id = :id"
                    ),
                    {"id": response.user_id},
                )
                # 4+3+2+1 = 10 events across the 4 seeded applications.
                assert event_row.scalar_one() == 10

                resume_row = await sess.execute(
                    text(
                        "SELECT COUNT(*) FROM resume_upload_jobs "
                        "WHERE user_id = :id AND status = 'complete'"
                    ),
                    {"id": response.user_id},
                )
                assert resume_row.scalar_one() == 1
    finally:
        await engine.dispose()


async def test_create_demo_user_rejects_duplicate_email() -> None:
    """Passing the same email twice raises ValueError (409)."""
    first = await demo_service.create_demo_user(email="demo+dupe@myjobhunter-demo.example.com")
    assert first.credentials.email == "demo+dupe@myjobhunter-demo.example.com"

    with pytest.raises(ValueError, match="already exists"):
        await demo_service.create_demo_user(email="demo+dupe@myjobhunter-demo.example.com")


async def test_list_demo_users_returns_only_demo_rows() -> None:
    """The list endpoint never surfaces real (is_demo=False) users."""
    created = await demo_service.create_demo_user()

    listing = await demo_service.list_demo_users()

    assert listing.total == 1
    assert len(listing.users) == 1
    assert listing.users[0].user_id == created.user_id
    assert listing.users[0].application_count == 4
    assert listing.users[0].company_count == 3


async def test_delete_demo_user_cascades_data() -> None:
    """Deleting a demo user removes them and every cascade-able row."""
    created = await demo_service.create_demo_user()
    user_id = created.user_id

    delete_response = await demo_service.delete_demo_user(user_id)
    assert "deleted successfully" in delete_response.message

    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as sess:
            async with sess.begin():
                user_row = await sess.execute(
                    text("SELECT COUNT(*) FROM users WHERE id = :id"),
                    {"id": user_id},
                )
                assert user_row.scalar_one() == 0
                # Every domain row should have cascade-deleted.
                for table in (
                    "profiles",
                    "work_history",
                    "education",
                    "skills",
                    "companies",
                    "applications",
                    "application_events",
                    "resume_upload_jobs",
                ):
                    row = await sess.execute(
                        text(f"SELECT COUNT(*) FROM {table} WHERE user_id = :id"),
                        {"id": user_id},
                    )
                    assert row.scalar_one() == 0, f"{table} should be empty"
    finally:
        await engine.dispose()


async def test_delete_demo_user_refuses_unknown_id() -> None:
    """Deleting a non-existent id raises LookupError (404).

    The error body is intentionally generic — it must be byte-identical
    for both "id is bogus" and "id is a real (non-demo) user" so the
    endpoint cannot be used as an account-enumeration oracle.
    """
    with pytest.raises(LookupError) as exc_info:
        await demo_service.delete_demo_user(uuid.uuid4())
    assert str(exc_info.value) == "Demo user not found."


# ---------------------------------------------------------------------------
# HTTP-layer tests (verify admin gate + response shape)
# ---------------------------------------------------------------------------


async def _promote_to_admin(email: str) -> None:
    """Flip a user's role to admin AND set is_superuser=True via raw SQL.

    Both flags are needed: the demo router gates writes on
    ``current_strict_superuser`` (PR F1) which checks ``is_superuser``,
    and the GET endpoint gates on ``current_superuser`` which also
    checks ``is_superuser``. Pre-F1 this fixture only set ``role`` —
    the test was masked by an unrelated bug in the gate (it was
    returning 403 even before the strict-gate change). Fixed here as
    part of F1 so the test exercises a real authorized admin flow.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as sess:
            async with sess.begin():
                await sess.execute(
                    text(
                        "UPDATE users SET role = 'admin', is_superuser = TRUE "
                        "WHERE email = :e"
                    ),
                    {"e": email},
                )
    finally:
        await engine.dispose()


@pytest.fixture()
def _bypass_strict_gate():
    """Override the strict-superuser dependency so HTTP-layer demo tests
    don't have to enroll TOTP + generate a fresh code on every run.

    The strict-gate's three checks (is_superuser + recent iat +
    X-TOTP-Code) are exhaustively tested at the unit level in
    ``packages/shared-backend/tests/test_permissions.py`` and at the
    router-wiring level in ``test_admin_router_stepup.py``. Re-testing
    them here would just duplicate that surface; what these HTTP tests
    actually verify is the demo-service contract, not the auth chain.
    """
    from app.core.permissions import current_strict_superuser
    from app.main import app
    from app.models.user.user import User

    async def _admin_passthrough() -> User:
        from app.db.session import AsyncSessionLocal
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            row = await db.execute(
                select(User).where(User.is_superuser.is_(True)).limit(1),
            )
            user = row.scalar_one_or_none()
            assert user is not None, "no superuser admin found in test DB"
            return user

    app.dependency_overrides[current_strict_superuser] = _admin_passthrough
    yield
    app.dependency_overrides.pop(current_strict_superuser, None)


async def _login(email: str, password: str) -> str:
    """Return a JWT bearer token for the given credentials."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test",
    ) as ac:
        resp = await ac.post(
            "/auth/jwt/login",
            data={"username": email, "password": password},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["access_token"]


async def test_post_demo_users_rejects_non_admin(user_factory) -> None:
    """A regular user gets 403, not the demo seed."""
    user = await user_factory()
    token = await _login(user["email"], user["password"])

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test",
    ) as ac:
        resp = await ac.post(
            "/admin/demo/users",
            headers={"Authorization": f"Bearer {token}"},
            json={},
        )

    assert resp.status_code == 403


async def test_post_demo_users_admin_can_create(user_factory, _bypass_strict_gate) -> None:
    """Admin gets 201 + credentials and the seed data persists."""
    admin_user = await user_factory()
    await _promote_to_admin(admin_user["email"])
    token = await _login(admin_user["email"], admin_user["password"])

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test",
    ) as ac:
        resp = await ac.post(
            "/admin/demo/users",
            headers={"Authorization": f"Bearer {token}"},
            json={},
        )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "credentials" in body
    assert body["credentials"]["email"].endswith("@myjobhunter-demo.example.com")
    assert body["user_id"]


async def test_get_demo_users_returns_summaries(user_factory) -> None:
    """GET /admin/demo/users returns the right shape."""
    admin_user = await user_factory()
    await _promote_to_admin(admin_user["email"])
    token = await _login(admin_user["email"], admin_user["password"])

    await demo_service.create_demo_user()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test",
    ) as ac:
        resp = await ac.get(
            "/admin/demo/users",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["users"][0]["application_count"] == 4
    assert body["users"][0]["company_count"] == 3
