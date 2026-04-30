"""Verify MJH's wiring to the shared audit listener (PR C2).

Asserts:
- The audit listener (registered in MJH's main lifespan) writes ``audit_logs``
  rows when MJH models are inserted.
- ``changed_by`` is populated from the request-scoped ``current_user_id``
  ContextVar (i.e., the JWT-bearing actor on a real request).
- Anonymous writes (no current_user_id) leave ``changed_by`` NULL.
- ``audit_logs`` itself is in ``_skip_tables`` so writes to it don't recurse.
- ``auth_events``, ``extraction_logs``, ``resume_upload_jobs`` are skipped.
- The MJH PII allowlist is registered (regression: refactoring away the
  import-time ``register_*`` calls would silently leak plaintext into the
  audit table).

Schema-level wiring uses a dedicated async engine + session per test so the
listener's after-flush audit row queue commits cleanly. The conftest's
shared ``db`` fixture uses a rolled-back-transaction pattern that doesn't
mix well with the listener's autoflush behaviour, so we bypass it for these
tests and clean up our own rows.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Importing ``app.core.audit`` runs the module body which calls
# ``register_sensitive_fields(MJH_SENSITIVE_FIELDS)`` etc. We rely on that
# side effect — keep the import at module top.
from app.core.audit import (  # noqa: F401
    MJH_SENSITIVE_FIELDS,
    MJH_SKIP_FIELDS,
    MJH_SKIP_TABLES,
    current_user_id,
    register_audit_listeners,
)
from app.core.config import settings
from app.models.company.company import Company
from app.models.user.user import User
from platform_shared.core.audit import (
    get_sensitive_fields,
    get_skip_tables,
)
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.db.models.auth_event import AuthEvent


@pytest.fixture(autouse=True)
def _attach_listener() -> None:
    """The shared audit listener must be attached for these tests.

    ASGITransport doesn't invoke FastAPI's lifespan in unit tests, so the
    listener registration that normally happens at app startup never runs.
    Call it explicitly here. ``register_audit_listeners()`` is idempotent.
    """
    register_audit_listeners()


@pytest_asyncio.fixture()
async def audit_session() -> AsyncIterator[AsyncSession]:
    """A committed-mode session dedicated to audit listener tests.

    Bypasses the conftest ``db`` fixture's rolled-back-transaction pattern
    because the audit listener's ``after_flush`` queue interacts poorly
    with autobegin transactions held open across the user_factory teardown.

    Cleans up its own rows so it doesn't leak data across tests.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    # Track ids we created so teardown can hard-delete them.
    created_user_ids: list[uuid.UUID] = []

    async with sessionmaker() as session:
        # Stash the tracking list on the session for tests to append to.
        session.info["created_user_ids"] = created_user_ids
        yield session

    # Teardown: best-effort hard-delete of test artifacts via raw SQL on a
    # fresh connection. CASCADE on user_id removes related companies/audit
    # rows that referenced the deleted users.
    async with sessionmaker() as cleanup:
        async with cleanup.begin():
            if created_user_ids:
                await cleanup.execute(
                    delete(User).where(User.id.in_(created_user_ids)),
                )
            # Any AuditLog rows produced by the test (table_name companies
            # for users we just deleted) are kept — audit rows have no FK
            # to users by design. Delete by table_name to keep the table
            # clean across runs.
            await cleanup.execute(
                text("DELETE FROM audit_logs WHERE table_name IN ('companies', 'auth_events', 'manual_test', 'users')"),
            )
            await cleanup.execute(
                text("DELETE FROM auth_events WHERE event_type = 'login_success'"),
            )

    await engine.dispose()


async def _create_user(session: AsyncSession) -> User:
    """Create a test user committed to the DB so FK references resolve."""
    user = User(
        id=uuid.uuid4(),
        email=f"audit-test-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 60,  # bcrypt-shaped placeholder, not validated
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    session.add(user)
    await session.commit()
    session.info["created_user_ids"].append(user.id)
    return user


class TestMJHAuditRegistration:
    def test_default_audit_logs_skip_table_is_present(self) -> None:
        # platform_shared seeds this — without it the listener would recurse
        # infinitely on every flush.
        assert "audit_logs" in get_skip_tables()

    def test_mjh_high_volume_skip_tables_are_registered(self) -> None:
        registered = get_skip_tables()
        for table in ("auth_events", "extraction_logs", "resume_upload_jobs"):
            assert table in registered, (
                f"{table!r} must be registered as a skip-table — auditing "
                "high-volume / cost-meter rows would bloat audit_logs."
            )

    def test_mjh_secrets_are_registered(self) -> None:
        registered = get_sensitive_fields()
        for field in ("hashed_password", "totp_secret_encrypted", "totp_recovery_codes"):
            assert field in registered, (
                f"{field!r} must be registered as sensitive — the audit "
                "listener would otherwise capture plaintext secrets."
            )

    def test_mjh_constants_match_registered_state(self) -> None:
        # The exported MJH_SENSITIVE_FIELDS constant is the documentation
        # surface — every entry must actually have been pushed into the
        # shared registry.
        for field in MJH_SENSITIVE_FIELDS:
            assert field in get_sensitive_fields()
        for table in MJH_SKIP_TABLES:
            assert table in get_skip_tables()


class TestAuditWritesOnModelChange:
    """Drive the listener with a real MJH model write."""

    @pytest.mark.asyncio
    async def test_insert_writes_audit_rows_with_actor(
        self, audit_session: AsyncSession,
    ) -> None:
        user = await _create_user(audit_session)

        token = current_user_id.set(str(user.id))
        try:
            company = Company(
                user_id=user.id,
                name="Acme Co",
                primary_domain="acme.example",
            )
            audit_session.add(company)
            await audit_session.commit()
        finally:
            current_user_id.reset(token)

        rows = (await audit_session.execute(
            select(AuditLog).where(AuditLog.table_name == "companies"),
        )).scalars().all()

        assert rows, "expected audit_logs rows for the inserted company"
        assert all(r.operation == "INSERT" for r in rows)
        assert all(r.changed_by == str(user.id) for r in rows)

        by_field = {r.field_name: r for r in rows}
        # Spot-check non-sensitive columns.
        assert "name" in by_field
        assert by_field["name"].new_value == "Acme Co"
        assert "primary_domain" in by_field
        assert by_field["primary_domain"].new_value == "acme.example"

    @pytest.mark.asyncio
    async def test_anonymous_write_has_null_changed_by(
        self, audit_session: AsyncSession,
    ) -> None:
        # No current_user_id set → audit_logs.changed_by must be NULL.
        user = await _create_user(audit_session)

        company = Company(
            user_id=user.id,
            name="Anonymous Write Co",
            primary_domain="anon.example",
        )
        audit_session.add(company)
        await audit_session.commit()

        rows = (await audit_session.execute(
            select(AuditLog).where(
                AuditLog.table_name == "companies",
                AuditLog.field_name == "name",
                AuditLog.new_value == "Anonymous Write Co",
            ),
        )).scalars().all()
        assert rows
        assert all(r.changed_by is None for r in rows)

    @pytest.mark.asyncio
    async def test_audit_logs_table_does_not_recurse(
        self, audit_session: AsyncSession,
    ) -> None:
        # Inserting an AuditLog row directly must not generate audit rows for
        # the audit_logs table itself — the seed default skip-table is the
        # recursion guard.
        manual = AuditLog(
            table_name="manual_test",
            record_id="1",
            operation="INSERT",
            field_name="x",
            old_value=None,
            new_value="manual",
        )
        audit_session.add(manual)
        await audit_session.commit()

        recursive_rows = (await audit_session.execute(
            select(AuditLog).where(AuditLog.table_name == "audit_logs"),
        )).scalars().all()
        assert recursive_rows == []

    @pytest.mark.asyncio
    async def test_auth_events_writes_are_not_audited(
        self, audit_session: AsyncSession,
    ) -> None:
        # auth_events is the parallel security audit channel — auditing it
        # would just double the row count without adding any signal. The
        # MJH wrapper's MJH_SKIP_TABLES registers it.
        user = await _create_user(audit_session)
        event = AuthEvent(
            user_id=user.id,
            event_type="login_success",
            succeeded=True,
            event_metadata={},
        )
        audit_session.add(event)
        await audit_session.commit()

        rows = (await audit_session.execute(
            select(AuditLog).where(AuditLog.table_name == "auth_events"),
        )).scalars().all()
        assert rows == [], "auth_events must be in _skip_tables"
