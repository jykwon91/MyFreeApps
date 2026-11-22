"""Deleting an account through ``DELETE /users/me`` erases its content from ``audit_logs``.

The audit listener copies every field a user writes (contact emails, JD text,
notes) into ``audit_logs``, and deleting the user row adds a snapshot of their
email and name. After the deletion none of that may be readable, including
what a background worker or another user wrote about the deleted rows. Another
user's rows keep their whole history, even the parts the deleted user wrote.
"""
import uuid
from collections.abc import Iterator

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import MJH_SENSITIVE_FIELDS, MJH_SKIP_FIELDS, MJH_SKIP_TABLES
from app.core.auth import current_active_user
from app.db.session import get_db
from app.main import app
from app.models.application.application import Application
from app.models.application.application_contact import ApplicationContact
from app.models.company.company import Company
from app.models.user.user import User
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.audit_erasure import (
    TEST_ACCOUNT_PASSWORD_HASH,
    assert_audit_erased,
    audit_listener_attached,
    audit_values,
    delete_account_through_route,
    write_as,
)


@pytest.fixture(autouse=True)
def _audit_listener() -> Iterator[None]:
    with audit_listener_attached(
        sensitive_fields=MJH_SENSITIVE_FIELDS, skip_tables=MJH_SKIP_TABLES, skip_fields=MJH_SKIP_FIELDS,
    ):
        yield


def _user(tag: str) -> User:
    return User(
        id=uuid.uuid4(),
        email=f"{tag}-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=TEST_ACCOUNT_PASSWORD_HASH,
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=False,
        display_name=f"{tag} Display Name",
    )


async def _seed_job_search(db: AsyncSession, user: User, tag: str) -> Application:
    await write_as(db, user, user)
    company = Company(user_id=user.id, name=f"{tag} Company Inc")
    await write_as(db, user, company)
    application = Application(
        user_id=user.id, company_id=company.id, role_title=f"{tag} Staff Engineer",
        jd_text=f"{tag} job description text", notes=f"{tag} application notes",
    )
    await write_as(db, user, application)
    await write_as(db, user, ApplicationContact(
        user_id=user.id, application_id=application.id, name=f"{tag} Recruiter",
        email=f"{tag.lower()}-recruiter@contacts.example", notes=f"{tag} contact notes",
    ))
    application.notes = f"{tag} edited application notes"
    await write_as(db, user)
    return application


@pytest.mark.asyncio
async def test_deleting_an_account_erases_its_audit_history(db: AsyncSession) -> None:
    leaver = _user("Leaver")
    stayer = _user("Stayer")
    leavers = await _seed_job_search(db, leaver, "Leaver")
    stayers = await _seed_job_search(db, stayer, "Stayer")
    leavers.notes = "Leaver notes rewritten by a worker"
    await write_as(db, None)
    leavers.notes = "Leaver notes rewritten by the stayer"
    await write_as(db, stayer)
    stayers.role_title = "Stayer title set by the leaver"
    await write_as(db, leaver)
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
            leaver.email, "Leaver Display Name", "Leaver Company Inc", "Leaver Staff Engineer",
            "Leaver job description text", "Leaver application notes", "Leaver edited application notes",
            "Leaver Recruiter", "leaver-recruiter@contacts.example", "Leaver contact notes",
            "Leaver notes rewritten by a worker", "Leaver notes rewritten by the stayer",
        ],
        kept=[
            stayer.email, "Stayer Display Name", "Stayer Company Inc", "Stayer job description text",
            "Stayer edited application notes", "stayer-recruiter@contacts.example", "Stayer contact notes",
            "Stayer title set by the leaver",
        ],
    )
    assert await db.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.changed_by == str(stayer.id)),
    ) == stayer_rows
    snapshot = await db.scalar(
        select(func.count()).select_from(AuditLog).where(
            AuditLog.table_name == "users", AuditLog.record_id == str(leaver.id),
            AuditLog.operation == "DELETE",
        ),
    )
    assert snapshot, "the user row's DELETE is still recorded, without its values"
