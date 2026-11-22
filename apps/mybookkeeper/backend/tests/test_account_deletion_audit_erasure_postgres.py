"""Account deletion erases ``audit_logs`` values on migrated Postgres, past the immutability trigger.

``trg_audit_log_immutable`` refuses changes to ``audit_logs``. Since migration
``auditredact261122`` it lets one kind of UPDATE through: overwriting
``old_value`` / ``new_value`` with ``[erased]`` (or NULL) and nothing else. This
runs ``DELETE /users/me`` against a database migrated to head, then checks the
trigger still refuses any other UPDATE and every DELETE.

SQLite has no such trigger, so this needs Postgres: set ``MBK_TEST_POSTGRES_URL``
to an asyncpg URL of a database migrated with ``alembic upgrade head``. Skipped
otherwise. Everything runs inside one transaction that is rolled back, so the
database is left as it was found.
"""
import os
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.auth import current_active_user
from app.db.session import get_db
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property
from app.models.user.user import User
from platform_shared.core.audit_erasure_constants import ERASED_AUDIT_VALUE
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.audit_erasure import (
    TEST_ACCOUNT_PASSWORD_HASH,
    assert_audit_erased,
    audit_values,
    delete_account_through_route,
    write_as,
)

POSTGRES_URL = os.environ.get("MBK_TEST_POSTGRES_URL")

pytestmark = [
    pytest.mark.usefixtures("audit_listeners"),
    pytest.mark.skipif(not POSTGRES_URL, reason="MBK_TEST_POSTGRES_URL isn't set"),
]


@pytest_asyncio.fixture()
async def pg() -> AsyncIterator[AsyncSession]:
    """A session on migrated Postgres whose every write is rolled back at the end."""
    engine = create_async_engine(POSTGRES_URL or "")
    try:
        async with engine.connect() as connection:
            outer = await connection.begin()
            session = AsyncSession(
                bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False,
            )
            try:
                yield session
            finally:
                await session.close()
                await outer.rollback()
    finally:
        await engine.dispose()


def _user(tag: str) -> User:
    return User(
        id=uuid.uuid4(),
        email=f"{tag.lower()}-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=TEST_ACCOUNT_PASSWORD_HASH,
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=False,
        name=f"{tag} Full Name",
    )


async def _refused(pg: AsyncSession, statement: str, audit_id: int) -> bool:
    try:
        async with pg.begin_nested():
            await pg.execute(text(statement), {"id": audit_id})
    except DBAPIError as error:
        return "append-only" in str(error)
    return False


async def test_deleting_an_account_redacts_audit_logs_and_nothing_else_gets_through(pg: AsyncSession) -> None:
    leaver, stayer = _user("Leaver"), _user("Stayer")
    await write_as(pg, leaver, leaver)
    await write_as(pg, stayer, stayer)
    leavers_workspace = Organization(name="Leaver Rentals LLC", created_by=leaver.id)
    await write_as(pg, leaver, leavers_workspace)
    await write_as(pg, leaver, OrganizationMember(
        organization_id=leavers_workspace.id, user_id=leaver.id, org_role="owner",
    ))
    stayers_workspace = Organization(name="Stayer Rentals LLC", created_by=stayer.id)
    await write_as(pg, stayer, stayers_workspace)
    await write_as(pg, stayer, OrganizationMember(
        organization_id=stayers_workspace.id, user_id=stayer.id, org_role="owner",
    ))
    await write_as(pg, leaver, Property(
        organization_id=leavers_workspace.id, user_id=leaver.id, name="Leaver Beach House",
        address="Leaver 1 Ocean Drive",
    ))
    shared = Property(
        organization_id=stayers_workspace.id, user_id=stayer.id, name="Stayer Beach House",
        address="Stayer 1 Ocean Drive",
    )
    await write_as(pg, stayer, shared)
    await write_as(pg, leaver, OrganizationMember(
        organization_id=stayers_workspace.id, user_id=leaver.id, org_role="user", invited_by=stayer.id,
    ))
    shared.address = "Stayer 2 Harbor Road, edited by the leaver"
    await write_as(pg, leaver)
    leaver.name = "Leaver name set by a worker"
    await write_as(pg, None)

    assert await delete_account_through_route(
        app=app, db=pg, user=leaver, current_active_user=current_active_user,
        get_db=get_db, unit_of_work_path="app.api.account.unit_of_work",
    ) == 204

    assert_audit_erased(
        await audit_values(pg),
        erased=[
            leaver.email, "Leaver Full Name", "Leaver name set by a worker", "Leaver Rentals LLC",
            "Leaver Beach House", "Leaver 1 Ocean Drive",
        ],
        kept=[
            stayer.email, "Stayer Full Name", "Stayer Rentals LLC", "Stayer Beach House",
            "Stayer 1 Ocean Drive", "Stayer 2 Harbor Road, edited by the leaver",
        ],
    )

    erased_id = await pg.scalar(
        select(AuditLog.id).where(
            AuditLog.table_name == "users", AuditLog.record_id == str(leaver.id),
            AuditLog.operation == "DELETE", AuditLog.old_value == ERASED_AUDIT_VALUE,
        ).limit(1),
    )
    kept_id = await pg.scalar(
        select(AuditLog.id).where(AuditLog.new_value == "Stayer 1 Ocean Drive").limit(1),
    )
    assert erased_id is not None and kept_id is not None
    assert await _refused(pg, "UPDATE audit_logs SET old_value = 'rewritten' WHERE id = :id", erased_id)
    assert await _refused(pg, "UPDATE audit_logs SET new_value = 'rewritten' WHERE id = :id", kept_id)
    assert await _refused(
        pg, "UPDATE audit_logs SET new_value = '[erased]', field_name = 'other' WHERE id = :id", kept_id,
    )
    assert await _refused(pg, "UPDATE audit_logs SET changed_by = NULL WHERE id = :id", kept_id)
    assert await _refused(pg, "DELETE FROM audit_logs WHERE id = :id", erased_id)
    assert await _refused(pg, "DELETE FROM audit_logs WHERE id = :id", kept_id)
