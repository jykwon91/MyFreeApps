"""Deleting an account through ``DELETE /users/me`` erases its content from ``audit_logs``.

The audit listener copies every field a user writes into ``audit_logs``, and
deleting the user row adds a snapshot of their email and name. After the
deletion, the history of everything the deletion removed (the user row and
the workspace they created) has no readable values left.

What a background worker or another member wrote about those rows goes too.
What they wrote on rows that survive stays: another member's workspace record
is the workspace's history, and an app-wide setting isn't their data. So does
every other user's audit history.

The shared ``db`` fixture runs SQLite with foreign keys off, so nothing
cascades here: the leaver's own workspace holds no records, which would
otherwise survive and refuse the delete. Erasing what a cascade removes is
covered by the shared ``test_audit_erasure.py`` and the Postgres-backed apps.
"""
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property
from app.models.system.platform_settings import PlatformSettings
from app.models.user.user import User
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.repositories.deletion_scope_repo import workspace_tables
from platform_shared.testing.audit_erasure import (
    TEST_ACCOUNT_PASSWORD_HASH,
    assert_audit_erased,
    audit_values,
    delete_account_through_route,
    write_as,
)

pytestmark = pytest.mark.usefixtures("audit_listeners")


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


async def _workspace(db: AsyncSession, owner: User, tag: str) -> Organization:
    workspace = Organization(name=f"{tag} Rentals LLC", created_by=owner.id)
    await write_as(db, owner, workspace)
    await write_as(db, owner, OrganizationMember(organization_id=workspace.id, user_id=owner.id, org_role="owner"))
    return workspace


@pytest.mark.anyio
async def test_deleting_an_account_erases_its_audit_history(db: AsyncSession) -> None:
    leaver, stayer = _user("Leaver"), _user("Stayer")
    await write_as(db, leaver, leaver)
    await write_as(db, stayer, stayer)
    await _workspace(db, leaver, "Leaver")
    stayers_workspace = await _workspace(db, stayer, "Stayer")

    shared = Property(
        organization_id=stayers_workspace.id, user_id=stayer.id, name="Stayer Beach House",
        address="Stayer 1 Ocean Drive",
    )
    await write_as(db, stayer, shared)

    # The leaver is a member of the stayer's workspace and edits one of its records.
    await write_as(db, leaver, OrganizationMember(
        organization_id=stayers_workspace.id, user_id=leaver.id, org_role="user", invited_by=stayer.id,
    ))
    shared.address = "Stayer 2 Harbor Road, edited by the leaver"
    await write_as(db, leaver)
    await write_as(db, leaver, PlatformSettings(id=1, cost_daily_budget=Decimal("1234.56")))

    leaver.name = "Leaver name set by a worker"
    await write_as(db, None)
    leaver.name = "Leaver name set by the stayer"
    await write_as(db, stayer)
    stayer_rows = await db.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.changed_by == str(stayer.id)),
    )

    assert await delete_account_through_route(
        app=app, db=db, user=leaver, current_active_user=current_active_user,
        get_db=get_db, unit_of_work_path="app.api.account.unit_of_work",
    ) == 204

    assert_audit_erased(
        await audit_values(db),
        erased=[
            leaver.email, "Leaver Full Name", "Leaver Rentals LLC", "Leaver name set by a worker",
            "Leaver name set by the stayer",
        ],
        kept=[
            stayer.email, "Stayer Full Name", "Stayer Rentals LLC", "Stayer Beach House",
            "Stayer 1 Ocean Drive", "Stayer 2 Harbor Road, edited by the leaver", "1234.56",
        ],
    )
    assert await db.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.changed_by == str(stayer.id)),
    ) == stayer_rows


def test_workspace_records_without_their_own_organization_id_count_as_the_workspace_s() -> None:
    tables = workspace_tables(Base.metadata)
    for name in (
        "properties", "leases", "listing_photos", "inquiry_messages", "applicant_events",
        "signed_lease_attachments", "transaction_documents", "tax_form_fields",
    ):
        assert name in tables, name
    assert "users" not in tables
    assert "platform_settings" not in tables
