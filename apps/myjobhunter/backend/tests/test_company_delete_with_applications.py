"""DELETE /companies/{id} when applications still reference the company.

``applications.company_id`` is ON DELETE RESTRICT (applications keep their
company), so the route must refuse with a coded 409 rather than 500:

- live application -> 409 COMPANY_HAS_APPLICATIONS with the live count; row stays.
- soft-deleted applications don't block (nothing can restore or purge them):
  they are hard-deleted with the company, with their events, contacts and
  documents, their stored files are removed, and a posting promoted to one goes
  back to Discover. Live applications of the same company still block, and
  other companies' soft-deleted applications are untouched.
- no applications -> 204.
- another user's company -> 404.
- IntegrityError on the applications FK at delete time (a race the pre-check
  missed) is mapped to the same 409 as a backstop.
"""
from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_contact import ApplicationContact
from app.models.application.application_event import ApplicationEvent
from app.models.application.document import Document
from app.models.company.company import Company
from app.models.discovery.discovered_job import DiscoveredJob
from app.repositories.application import application_repository


async def _make_company(db: AsyncSession, user_id: uuid.UUID) -> Company:
    company = Company(user_id=user_id, name="Acme", primary_domain=f"acme-{uuid.uuid4().hex[:6]}.example")
    db.add(company)
    await db.flush()
    return company


async def _make_application(
    db: AsyncSession, user_id: uuid.UUID, company_id: uuid.UUID, *, deleted: bool = False,
) -> Application:
    application = Application(
        user_id=user_id,
        company_id=company_id,
        role_title="Engineer",
        deleted_at=dt.datetime.now(dt.timezone.utc) if deleted else None,
    )
    db.add(application)
    await db.flush()
    return application


async def _add_children(
    db: AsyncSession, user_id: uuid.UUID, application: Application, file_key: str,
) -> None:
    db.add(ApplicationEvent(
        user_id=user_id,
        application_id=application.id,
        event_type="applied",
        occurred_at=dt.datetime.now(dt.timezone.utc),
        source="manual",
    ))
    db.add(ApplicationContact(user_id=user_id, application_id=application.id, name="Rita Recruiter"))
    db.add(Document(
        user_id=user_id,
        application_id=application.id,
        title="Cover letter",
        kind="cover_letter",
        file_path=file_key,
        filename="cover.pdf",
    ))
    await db.flush()


async def _count_rows(db: AsyncSession, model: type, **filters: Any) -> int:
    stmt = select(func.count()).select_from(model)
    for column, value in filters.items():
        stmt = stmt.where(getattr(model, column) == value)
    return int(await db.scalar(stmt))


async def _company_exists(db: AsyncSession, company_id: uuid.UUID) -> bool:
    result = await db.execute(select(Company.id).where(Company.id == company_id))
    return result.scalar_one_or_none() is not None


class TestDeleteCompanyWithApplications:
    @pytest.mark.asyncio
    async def test_active_application_returns_coded_409_and_keeps_company(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        company = await _make_company(db, uuid.UUID(user["id"]))
        company_id = company.id
        await _make_application(db, uuid.UUID(user["id"]), company_id)

        async with await as_user(user) as authed:
            resp = await authed.delete(f"/companies/{company_id}")

        assert resp.status_code == 409, resp.text
        detail = resp.json()["detail"]
        assert detail["code"] == "COMPANY_HAS_APPLICATIONS"
        assert detail["application_count"] == 1
        assert "1 application" in detail["message"]
        assert await _company_exists(db, company_id)

    @pytest.mark.asyncio
    async def test_live_application_beside_soft_deleted_ones_blocks_and_counts_only_live(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        company = await _make_company(db, uuid.UUID(user["id"]))
        company_id = company.id
        deleted = await _make_application(db, uuid.UUID(user["id"]), company_id, deleted=True)
        deleted_id = deleted.id
        await _make_application(db, uuid.UUID(user["id"]), company_id)

        async with await as_user(user) as authed:
            resp = await authed.delete(f"/companies/{company_id}")

        assert resp.status_code == 409, resp.text
        detail = resp.json()["detail"]
        assert detail["application_count"] == 1
        assert "1 application " in detail["message"]
        assert await _company_exists(db, company_id)
        assert await _count_rows(db, Application, id=deleted_id) == 1

    @pytest.mark.asyncio
    async def test_only_soft_deleted_applications_are_removed_with_the_company(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        company = await _make_company(db, user_id)
        company_id = company.id
        first = await _make_application(db, user_id, company_id, deleted=True)
        second = await _make_application(db, user_id, company_id, deleted=True)
        first_id, second_id = first.id, second.id
        await _add_children(db, user_id, first, "documents/first.pdf")
        await _add_children(db, user_id, second, "documents/second.pdf")

        other_company = await _make_company(db, user_id)
        other_company_id = other_company.id
        other_app = await _make_application(db, user_id, other_company_id, deleted=True)
        other_app_id = other_app.id
        await _add_children(db, user_id, other_app, "documents/other.pdf")

        with patch("app.services.company.company_service.get_storage") as get_storage:
            async with await as_user(user) as authed:
                resp = await authed.delete(f"/companies/{company_id}")

        assert resp.status_code == 204, resp.text
        assert not await _company_exists(db, company_id)
        for application_id in (first_id, second_id):
            assert await _count_rows(db, Application, id=application_id) == 0
            assert await _count_rows(db, ApplicationEvent, application_id=application_id) == 0
            assert await _count_rows(db, ApplicationContact, application_id=application_id) == 0
            assert await _count_rows(db, Document, application_id=application_id) == 0
        removed_keys = {call.args[0] for call in get_storage.return_value.delete_file.call_args_list}
        assert removed_keys == {"documents/first.pdf", "documents/second.pdf"}

        assert await _company_exists(db, other_company_id)
        assert await _count_rows(db, Application, id=other_app_id) == 1
        assert await _count_rows(db, Document, application_id=other_app_id) == 1

    @pytest.mark.asyncio
    async def test_posting_promoted_to_a_soft_deleted_application_returns_to_discover(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        company = await _make_company(db, user_id)
        company_id = company.id
        application = await _make_application(db, user_id, company_id, deleted=True)
        posting = DiscoveredJob(
            user_id=user_id,
            source="greenhouse",
            source_external_id=str(uuid.uuid4()),
            title="Backend Engineer",
            company_name="Acme",
            promoted_application_id=application.id,
            promoted_at=dt.datetime.now(dt.timezone.utc),
        )
        db.add(posting)
        await db.flush()
        posting_id = posting.id

        with patch("app.services.company.company_service.get_storage", MagicMock()):
            async with await as_user(user) as authed:
                resp = await authed.delete(f"/companies/{company_id}")

        assert resp.status_code == 204, resp.text
        remaining = (await db.scalars(
            select(DiscoveredJob)
            .where(DiscoveredJob.id == posting_id)
            .execution_options(populate_existing=True)
        )).one()
        assert remaining.promoted_application_id is None
        assert remaining.promoted_at is None

    @pytest.mark.asyncio
    async def test_company_without_applications_returns_204(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        company = await _make_company(db, uuid.UUID(user["id"]))
        company_id = company.id

        async with await as_user(user) as authed:
            resp = await authed.delete(f"/companies/{company_id}")

        assert resp.status_code == 204, resp.text
        assert not await _company_exists(db, company_id)

    @pytest.mark.asyncio
    async def test_other_users_company_returns_404_even_with_applications(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        company = await _make_company(db, uuid.UUID(owner["id"]))
        company_id = company.id
        await _make_application(db, uuid.UUID(owner["id"]), company_id)

        async with await as_user(attacker) as authed:
            resp = await authed.delete(f"/companies/{company_id}")

        assert resp.status_code == 404, resp.text

    @pytest.mark.asyncio
    async def test_integrity_error_backstop_maps_to_coded_409(
        self,
        db: AsyncSession,
        user_factory: Callable[..., Any],
        as_user: Callable[..., Any],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """If the pre-check misses a racing application, the FK error is mapped."""
        user = await user_factory()
        company = await _make_company(db, uuid.UUID(user["id"]))
        company_id = company.id
        await _make_application(db, uuid.UUID(user["id"]), company_id)

        real_count = application_repository.count_live_for_company
        calls = 0

        async def count_zero_first(*args: Any, **kwargs: Any) -> int:
            nonlocal calls
            calls += 1
            return 0 if calls == 1 else await real_count(*args, **kwargs)

        monkeypatch.setattr(
            application_repository, "count_live_for_company", count_zero_first,
        )

        async with await as_user(user) as authed:
            resp = await authed.delete(f"/companies/{company_id}")

        assert resp.status_code == 409, resp.text
        assert resp.json()["detail"]["code"] == "COMPANY_HAS_APPLICATIONS"
        assert resp.json()["detail"]["application_count"] == 1
        assert await _company_exists(db, company_id)
