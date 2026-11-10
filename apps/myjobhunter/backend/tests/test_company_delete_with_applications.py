"""DELETE /companies/{id} when applications still reference the company.

``applications.company_id`` is ON DELETE RESTRICT (applications keep their
company), so the route must refuse with a coded 409 rather than 500:

- active application -> 409 COMPANY_HAS_APPLICATIONS with the count; row stays.
- only a soft-deleted application -> still 409 (it holds the FK).
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

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.company.company import Company
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
    async def test_soft_deleted_application_still_blocks_delete(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        company = await _make_company(db, uuid.UUID(user["id"]))
        company_id = company.id
        await _make_application(db, uuid.UUID(user["id"]), company_id, deleted=True)
        await _make_application(db, uuid.UUID(user["id"]), company_id)

        async with await as_user(user) as authed:
            resp = await authed.delete(f"/companies/{company_id}")

        assert resp.status_code == 409, resp.text
        assert resp.json()["detail"]["application_count"] == 2
        assert await _company_exists(db, company_id)

    @pytest.mark.asyncio
    async def test_only_soft_deleted_application_returns_409(
        self, db: AsyncSession, user_factory: Callable[..., Any], as_user: Callable[..., Any],
    ) -> None:
        user = await user_factory()
        company = await _make_company(db, uuid.UUID(user["id"]))
        company_id = company.id
        await _make_application(db, uuid.UUID(user["id"]), company_id, deleted=True)

        async with await as_user(user) as authed:
            resp = await authed.delete(f"/companies/{company_id}")

        assert resp.status_code == 409, resp.text
        assert resp.json()["detail"]["code"] == "COMPANY_HAS_APPLICATIONS"

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

        real_count = application_repository.count_for_company_including_deleted
        calls = 0

        async def count_zero_first(*args: Any, **kwargs: Any) -> int:
            nonlocal calls
            calls += 1
            return 0 if calls == 1 else await real_count(*args, **kwargs)

        monkeypatch.setattr(
            application_repository, "count_for_company_including_deleted", count_zero_first,
        )

        async with await as_user(user) as authed:
            resp = await authed.delete(f"/companies/{company_id}")

        assert resp.status_code == 409, resp.text
        assert resp.json()["detail"]["code"] == "COMPANY_HAS_APPLICATIONS"
        assert resp.json()["detail"]["application_count"] == 1
        assert await _company_exists(db, company_id)
