"""Tests for the ``?company_id=`` filter on ``GET /applications``.

Covers:
- Happy path: applications are scoped to the given company_id.
- Multi-company: applications for company A are NOT returned when filtering
  by company B's id.
- Tenant isolation: filtering by another user's company_id returns an empty
  list (200 + empty items), NOT a 403/404 — no ownership information leaks.
- No filter: omitting company_id returns all user applications (regression
  guard — the new query param must be truly optional).

Audit fix 2026-05-02.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company


async def _create_company(db: AsyncSession, user_id: uuid.UUID, name: str) -> Company:
    company = Company(
        user_id=user_id,
        name=name,
        primary_domain=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}.example",
    )
    db.add(company)
    await db.flush()
    return company


def _app_payload(company_id: uuid.UUID, role: str = "Software Engineer") -> dict:
    return {
        "company_id": str(company_id),
        "role_title": role,
        "remote_type": "remote",
        "source": "linkedin",
    }


class TestApplicationCompanyFilter:
    @pytest.mark.asyncio
    async def test_filter_returns_only_matching_company(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Applications for company_a are returned; company_b's are excluded."""
        user = await user_factory()
        company_a = await _create_company(db, uuid.UUID(user["id"]), "Alpha Corp")
        company_b = await _create_company(db, uuid.UUID(user["id"]), "Beta Corp")

        async with await as_user(user) as authed:
            resp_a = await authed.post("/applications", json=_app_payload(company_a.id, "Eng A"))
            assert resp_a.status_code == 201
            resp_b = await authed.post("/applications", json=_app_payload(company_b.id, "Eng B"))
            assert resp_b.status_code == 201

            list_resp = await authed.get(f"/applications?company_id={company_a.id}")

        assert list_resp.status_code == 200
        body = list_resp.json()
        assert body["total"] == 1
        assert body["items"][0]["role_title"] == "Eng A"
        assert body["items"][0]["company_id"] == str(company_a.id)

    @pytest.mark.asyncio
    async def test_filter_empty_when_no_applications_for_company(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """A company with no applications returns an empty list, not 404."""
        user = await user_factory()
        company_a = await _create_company(db, uuid.UUID(user["id"]), "Alpha Corp")
        company_b = await _create_company(db, uuid.UUID(user["id"]), "Beta Corp")

        async with await as_user(user) as authed:
            # Only add application for company_a.
            resp = await authed.post("/applications", json=_app_payload(company_a.id))
            assert resp.status_code == 201

            # Filter by company_b → empty list.
            list_resp = await authed.get(f"/applications?company_id={company_b.id}")

        assert list_resp.status_code == 200
        body = list_resp.json()
        assert body["total"] == 0
        assert body["items"] == []

    @pytest.mark.asyncio
    async def test_no_filter_returns_all_applications(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Omitting company_id returns all the caller's applications (regression guard)."""
        user = await user_factory()
        company_a = await _create_company(db, uuid.UUID(user["id"]), "Alpha Corp")
        company_b = await _create_company(db, uuid.UUID(user["id"]), "Beta Corp")

        async with await as_user(user) as authed:
            await authed.post("/applications", json=_app_payload(company_a.id))
            await authed.post("/applications", json=_app_payload(company_b.id))

            list_resp = await authed.get("/applications")

        assert list_resp.status_code == 200
        body = list_resp.json()
        assert body["total"] == 2

    @pytest.mark.asyncio
    async def test_cross_tenant_company_id_returns_empty_not_error(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Filtering by another user's company_id returns 200 + empty list.

        This is the key tenant isolation guarantee: callers cannot distinguish
        "this company doesn't exist" from "this company belongs to someone else"
        because both cases produce an empty list.  A 403/404 response would
        confirm to an attacker that the company_id is valid under another account.
        """
        owner = await user_factory()
        attacker = await user_factory()
        owner_company = await _create_company(db, uuid.UUID(owner["id"]), "Owner Corp")

        async with await as_user(owner) as owner_client:
            resp = await owner_client.post("/applications", json=_app_payload(owner_company.id))
            assert resp.status_code == 201

        # Attacker queries using owner's company_id.
        async with await as_user(attacker) as attacker_client:
            list_resp = await attacker_client.get(f"/applications?company_id={owner_company.id}")

        assert list_resp.status_code == 200
        body = list_resp.json()
        # Empty list — no ownership info leaked.
        assert body["total"] == 0
        assert body["items"] == []

    @pytest.mark.asyncio
    async def test_invalid_uuid_returns_422(
        self, user_factory, as_user,
    ) -> None:
        """A malformed (non-UUID) company_id query param returns 422."""
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/applications?company_id=not-a-uuid")
        assert resp.status_code == 422
