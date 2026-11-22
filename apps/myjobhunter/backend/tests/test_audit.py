"""Verify MJH's wiring to the shared audit listener (PR C2).

Asserts:
- The audit listener (registered in MJH's main lifespan) writes ``audit_logs``
  rows when MJH models are inserted.
- ``changed_by`` is populated from the request-scoped ``current_user_id``
  ContextVar (i.e., the JWT-bearing actor on a real request).
- Anonymous writes (no current_user_id) leave ``changed_by`` NULL.
- ``audit_logs`` itself is in ``_skip_tables`` so writes to it don't recurse.
- ``auth_events``, ``extraction_logs``, ``resume_upload_jobs`` are skipped.
- MJH's production lifespan attaches the listener with MJH's ``AUDIT_CONFIG``
  (regression: PR #2623 dropped the import that registered the masking sets,
  and plaintext secrets went into the audit table).

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
from platform_shared.core.audit import register_audit_listeners
from platform_shared.core.audit_config import AuditConfig
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.db.models.auth_event import AuthEvent
from platform_shared.testing.audit_wiring import audit_config_attached_by_lifespan
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.audit import AUDIT_CONFIG, current_user_id
from app.core.config import settings
from app.main import app
from app.models.company.company import Company
from app.models.user.user import User


@pytest.fixture(autouse=True)
def _attach_listener() -> None:
    """The shared audit listener must be attached for these tests.

    ASGITransport doesn't invoke FastAPI's lifespan in unit tests, so the
    listener registration that normally happens at app startup never runs.
    Attach it here with the same config. Idempotent for the same config.
    """
    register_audit_listeners(AUDIT_CONFIG)


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
    """Runs ``app.main``'s real lifespan up to the audit step."""

    @pytest_asyncio.fixture()
    async def attached(self) -> AuditConfig:
        config = await audit_config_attached_by_lifespan(app)
        register_audit_listeners(AUDIT_CONFIG)  # restore what _attach_listener set up
        return config

    @pytest.mark.asyncio
    async def test_lifespan_attaches_the_app_config(self, attached: AuditConfig) -> None:
        assert attached == AUDIT_CONFIG

    @pytest.mark.asyncio
    async def test_mjh_high_volume_skip_tables_are_skipped(self, attached: AuditConfig) -> None:
        for table in ("auth_events", "refresh_sessions", "extraction_logs", "resume_upload_jobs"):
            assert table in attached.skip_tables, (
                f"{table!r} must be a skip-table — auditing high-volume / "
                "cost-meter / secret-bearing rows would bloat or leak into audit_logs."
            )

    @pytest.mark.asyncio
    async def test_mjh_secrets_are_masked(self, attached: AuditConfig) -> None:
        # `totp_secret` is the actual SQLAlchemy column (typed as
        # EncryptedString — the listener sees the decrypted value). The mask
        # MUST match this exact attribute name.
        for field in ("hashed_password", "totp_secret", "totp_recovery_codes"):
            assert field in attached.sensitive_fields, (
                f"{field!r} must be masked — the audit listener would otherwise "
                "capture plaintext secrets."
            )


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
