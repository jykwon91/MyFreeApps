"""Account deletion removes applications before companies.

``applications.company_id`` is a RESTRICT foreign key, and applications and companies both
cascade from the user. ``prepare_deletion`` deletes the applications first so the outcome
never depends on which cascade Postgres happens to fire first.
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_contact import ApplicationContact
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company
from app.models.user.user import User
from app.services.user import account_deletion_service
from tests.test_account_deletion_files import (  # noqa: F401  (fixtures + helpers shared with the files tests)
    _delete_account,
    _make_user,
    _patch_session,
    _user_exists,
)


async def _count(db: AsyncSession, model: type, user_id: uuid.UUID) -> int:
    return await db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id))


async def _user_with_applications(db: AsyncSession) -> User:
    user = _make_user()
    db.add(user)
    await db.flush()
    for name in ("Acme", "Globex"):
        company = Company(user_id=user.id, name=name)
        db.add(company)
        await db.flush()
        application = Application(user_id=user.id, company_id=company.id, role_title="Engineer")
        db.add(application)
        await db.flush()
        db.add(ApplicationEvent(
            user_id=user.id, application_id=application.id, event_type="applied",
            occurred_at=datetime.now(timezone.utc), source="manual",
        ))
        db.add(ApplicationContact(user_id=user.id, application_id=application.id, name="Recruiter"))
    # A soft-deleted application still holds its company, so it has to go too.
    db.add(Application(
        user_id=user.id, company_id=company.id, role_title="Old", deleted_at=datetime.now(timezone.utc),
    ))
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_deleting_an_account_with_companies_and_applications_leaves_no_rows(db: AsyncSession) -> None:
    user = await _user_with_applications(db)
    other = await _user_with_applications(db)

    with patch("app.services.user.account_deletion_service.get_storage", MagicMock()):
        response = await _delete_account(user)

    assert response.status_code == 204
    assert not await _user_exists(db, user.id)
    for model in (Company, Application, ApplicationEvent, ApplicationContact):
        assert await _count(db, model, user.id) == 0
    assert await _count(db, Company, other.id) == 2
    assert await _count(db, Application, other.id) == 3


@pytest.mark.asyncio
async def test_prepare_deletion_deletes_applications_but_leaves_companies(db: AsyncSession) -> None:
    user = await _user_with_applications(db)

    with patch("app.services.user.account_deletion_service.get_storage", MagicMock()):
        await account_deletion_service.prepare_deletion(db, user)

    assert await _count(db, Application, user.id) == 0
    assert await _count(db, ApplicationEvent, user.id) == 0
    assert await _count(db, Company, user.id) == 2


@pytest.mark.asyncio
async def test_a_company_with_applications_still_cannot_be_deleted(db: AsyncSession) -> None:
    user = await _user_with_applications(db)
    company = (await db.scalars(select(Company).where(Company.user_id == user.id))).first()

    await db.delete(company)
    with pytest.raises(IntegrityError):
        await db.flush()
    await db.rollback()
