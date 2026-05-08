"""Canonical test-fixture factories for platform_shared consuming apps.

Two distinct patterns exist across the monorepo and are exposed here:

Pattern A — direct-insert (SQLite / in-memory, repository-layer tests)
    Used by MyBookkeeper. Tests run against an in-memory SQLite database;
    fixtures insert ORM model instances directly via the test session.

    Call ``make_user_fixture(user_model, org_model)`` to get a pair of
    pytest fixture functions (``test_user`` and ``test_org``) that return
    the app's own ORM model instances. Register them in the app's conftest::

        from platform_shared.testing.factories import make_user_fixture

        test_user, test_org = make_user_fixture(
            user_model=User,
            org_model=Organization,
            org_member_model=OrganizationMember,
        )

Pattern B — API-register (Postgres / integration tests)
    Used by MyJobHunter. Tests run against a real Postgres database; users
    are created via the ``/auth/register`` endpoint so the full auth stack
    (HIBP, Turnstile, hashing, fastapi-users) is exercised. The factory
    function hard-deletes all created users in teardown to prevent
    cross-session contamination.

    Call ``make_api_user_factory(app, database_url, get_db_dep)`` to get
    a pytest fixture function. Register it in the app's conftest::

        from platform_shared.testing.factories import make_api_user_factory
        from app.core.config import settings
        from app.main import app as fastapi_app
        from app.db.session import get_db

        user_factory = make_api_user_factory(
            app=fastapi_app,
            database_url_getter=lambda: settings.database_url,
            get_db_dep=get_db,
        )

    The function also installs the fast-password-helper monkeypatch at
    module import time (the same technique MJH used inline in conftest.py)
    so test suites that exercise many login attempts don't time out on
    argon2 hashing.

Notes
-----
- Hard-delete teardown is mandatory in Pattern B; Pattern A relies on the
  SQLite engine being discarded after each test.
- Per-app divergences (org_id on MBK users, no org on MJH users) are
  handled by kwargs passed to the factory functions, not by subclassing.
"""
from __future__ import annotations

import hashlib
import uuid
from collections.abc import AsyncGenerator, Callable
from typing import TYPE_CHECKING, Any

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

if TYPE_CHECKING:
    from fastapi import FastAPI


# ---------------------------------------------------------------------------
# Fast password helper — installed once when this module is first imported.
#
# fastapi-users' default PasswordHelper uses argon2 (~250ms/hash). Tests
# that exercise login or lockout run many hash operations; across an entire
# suite this can exceed the CI timeout.
#
# We replace the default-constructor symbol AND patch the class-level
# attribute so every fresh PasswordHelper() and every newly-constructed
# UserManager uses our fast stub. Production code is unaffected because
# this file is only imported inside test processes.
#
# Apps that do NOT import this module (e.g. MBK, which doesn't go through
# the login endpoint in repository-layer tests) are also unaffected.
# ---------------------------------------------------------------------------

class _FastPasswordHelper:
    """Test-only password helper — SHA-256 with no salt.

    NEVER use in production. Only deployed via this module for test sessions.
    """

    def hash(self, password: str) -> str:  # noqa: A003
        return "sha256:" + hashlib.sha256(password.encode()).hexdigest()

    def verify_and_update(
        self,
        plain_password: str,
        hashed_password: str,
    ) -> tuple[bool, str | None]:
        expected = "sha256:" + hashlib.sha256(plain_password.encode()).hexdigest()
        return (expected == hashed_password, None)

    def generate(self) -> str:
        return uuid.uuid4().hex


def _install_fast_password_helper() -> None:
    """Monkeypatch fastapi-users to use the fast test hasher.

    Safe to call multiple times — idempotent after the first call.
    """
    try:
        import fastapi_users.password as _fa_password
        from fastapi_users.manager import BaseUserManager
    except ImportError:
        # fastapi-users not installed (e.g. running shared-package tests
        # directly). Nothing to patch.
        return

    _fa_password.PasswordHelper = _FastPasswordHelper  # type: ignore[misc,assignment]
    BaseUserManager.password_helper = _FastPasswordHelper()  # type: ignore[assignment]

    _orig_init = BaseUserManager.__init__

    def _fast_init(self: Any, *args: Any, **kwargs: Any) -> None:  # noqa: ANN401
        _orig_init(self, *args, **kwargs)
        self.password_helper = _FastPasswordHelper()

    BaseUserManager.__init__ = _fast_init  # type: ignore[method-assign]


# Install at import time so the effect is in place before any test module
# that imports this file starts collecting.
_install_fast_password_helper()


# ---------------------------------------------------------------------------
# Pattern A — direct-insert fixtures (MBK / SQLite / repository tests)
# ---------------------------------------------------------------------------

def make_user_fixture(
    *,
    user_model: type,
    org_model: type | None = None,
    org_member_model: type | None = None,
) -> tuple[Any, Any]:
    """Return ``(test_user, test_org)`` pytest fixture functions.

    Each returned value is a ready-to-register ``pytest_asyncio.fixture``
    function.  Register them in the app's conftest by assigning the return
    values to module-level names that pytest can discover::

        from platform_shared.testing.factories import make_user_fixture
        from app.models.user.user import User
        from app.models.organization.organization import Organization
        from app.models.organization.organization_member import OrganizationMember

        test_user, test_org = make_user_fixture(
            user_model=User,
            org_model=Organization,
            org_member_model=OrganizationMember,
        )

    Parameters
    ----------
    user_model:
        The app's SQLAlchemy User ORM class.
    org_model:
        The app's SQLAlchemy Organization ORM class (optional; required only
        when ``test_org`` will be used by tests).
    org_member_model:
        The app's SQLAlchemy OrganizationMember ORM class (optional; required
        when ``test_org`` creates a membership row).

    Returns
    -------
    tuple[fixture_fn, fixture_fn]
        ``(test_user_fixture, test_org_fixture)``
    """

    @pytest_asyncio.fixture()
    async def _test_user(db: AsyncSession) -> Any:
        """Create and return a test user row in the test DB session."""
        user = user_model(
            id=uuid.uuid4(),
            email="test@example.com",
            hashed_password="fakehash",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    @pytest_asyncio.fixture()
    async def _test_org(db: AsyncSession, test_user: Any) -> Any:
        """Create a personal organisation for the test user.

        Requires ``org_model`` and ``org_member_model`` to be provided to
        ``make_user_fixture``.
        """
        if org_model is None:
            raise RuntimeError(
                "make_user_fixture: org_model must be provided to use test_org"
            )

        org = org_model(
            id=uuid.uuid4(),
            name=f"{test_user.email}'s Workspace",
            created_by=test_user.id,
        )
        db.add(org)
        await db.flush()

        if org_member_model is not None:
            member = org_member_model(
                organization_id=org.id,
                user_id=test_user.id,
                org_role="owner",
            )
            db.add(member)

        await db.commit()
        await db.refresh(org)
        return org

    return _test_user, _test_org


# ---------------------------------------------------------------------------
# Pattern B — API-register factory (MJH / Postgres / integration tests)
# ---------------------------------------------------------------------------

def make_api_user_factory(
    *,
    app: "FastAPI",
    database_url_getter: Callable[[], str],
    get_db_dep: Any,
) -> Any:
    """Return a ``user_factory`` pytest fixture function.

    The returned fixture is a callable that registers users via the app's
    ``/auth/register`` endpoint, then hard-deletes them after the test
    completes. This ensures no test artifacts persist in the database
    between test sessions.

    Usage in conftest.py::

        from platform_shared.testing.factories import make_api_user_factory
        from app.core.config import settings
        from app.main import app as fastapi_app
        from app.db.session import get_db

        user_factory = make_api_user_factory(
            app=fastapi_app,
            database_url_getter=lambda: settings.database_url,
            get_db_dep=get_db,
        )

    In tests::

        async def test_something(user_factory, client):
            user = await user_factory()            # auto-generated email
            user2 = await user_factory(email="bob@example.com", verified=False)

    Parameters
    ----------
    app:
        The FastAPI application instance.
    database_url_getter:
        Zero-argument callable returning the database URL string. Called at
        teardown time so it picks up the correct runtime settings value.
    get_db_dep:
        The ``get_db`` FastAPI dependency that will be overridden to share
        the test transaction with the fixture's calls.

    Returns
    -------
    A ``pytest_asyncio.fixture(scope="function")`` function.
    """
    from httpx import ASGITransport, AsyncClient  # noqa: PLC0415

    @pytest_asyncio.fixture(scope="function")
    async def _user_factory(
        client: AsyncClient,
        db: AsyncSession,
    ) -> AsyncGenerator[Callable[..., Any], None]:
        """Factory fixture: call to register a user, auto-cleaned up after test.

        Registers via the public /auth/register endpoint, then forces
        is_verified=True directly on the same rolled-back transaction so
        tests can call /auth/jwt/login without going through the verification
        flow. Pass ``verified=False`` to keep the user unverified.
        """
        created_emails: list[str] = []

        async def _create(
            email: str | None = None,
            password: str = "TestPassword123!",
            verified: bool = True,
        ) -> dict[str, Any]:
            _email = email or f"test-{uuid.uuid4().hex[:8]}@example.com"
            resp = await client.post(
                "/auth/register",
                json={"email": _email, "password": password},
            )
            assert resp.status_code == 201, f"Registration failed: {resp.text}"
            created_emails.append(_email)
            if verified:
                await db.execute(
                    text("UPDATE users SET is_verified = TRUE WHERE email = :email"),
                    {"email": _email},
                )
                # Commit so the row-exclusive lock is released. Service layers
                # that open their own session (e.g. totp_service.unit_of_work)
                # block forever if they try to UPDATE the same user row that
                # this session has locked.
                await db.commit()
            return {
                **resp.json(),
                "password": password,
                "email": _email,
                "is_verified": verified,
            }

        yield _create

        # Hard-delete so rows don't persist across test sessions.
        # fastapi-users' SQLAlchemyUserDatabase.create() commits during
        # /auth/register, so the user row is persisted regardless of the
        # test's rolled-back transaction; we explicitly purge via a fresh
        # engine outside the rolled-back session to keep the test DB clean.
        database_url = database_url_getter()
        cleanup_engine = create_async_engine(database_url, poolclass=NullPool)
        cleanup_factory = async_sessionmaker(cleanup_engine, expire_on_commit=False)
        async with cleanup_factory() as sess:
            async with sess.begin():
                for _email in created_emails:
                    user_row = await sess.execute(
                        text("SELECT id FROM users WHERE email = :email"),
                        {"email": _email},
                    )
                    user_id = user_row.scalar_one_or_none()
                    if user_id is not None:
                        await sess.execute(
                            text("DELETE FROM auth_events WHERE user_id = :uid"),
                            {"uid": user_id},
                        )
                    await sess.execute(
                        text("DELETE FROM users WHERE email = :email"),
                        {"email": _email},
                    )
                # Clear anonymous-failure rows (user_id IS NULL) — these
                # accumulate from /auth/totp/login bad-credentials tests.
                await sess.execute(
                    text("DELETE FROM auth_events WHERE user_id IS NULL"),
                )
        await cleanup_engine.dispose()

    return _user_factory
