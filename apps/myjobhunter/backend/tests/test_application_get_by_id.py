"""Tests for ``GET /applications/{id}`` (Phase 2.2).

The endpoint is a thin read on top of ``application_service.get_application``
already used by PATCH/DELETE — these tests cover the route layer:

- Happy path: 200 with full ApplicationResponse payload.
- Cross-tenant: user A asks for user B's app id → 404 (no existence leak).
- Soft-deleted: a row that has been DELETE'd → 404.
- Unauthenticated: 401.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company


async def _create_company(db: AsyncSession, user_id: uuid.UUID, name: str) -> Company:
    company = Company(user_id=user_id, name=name, primary_domain=f"{name.lower().replace(' ', '-')}.example.com")
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


def _make_application_payload(company_id: uuid.UUID) -> dict:
    return {
        "company_id": str(company_id),
        "role_title": "Senior Backend Engineer",
        "source": "linkedin",
        "remote_type": "remote",
    }


class TestGetApplicationById:
    @pytest.mark.asyncio
    async def test_happy_path_returns_full_payload(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create = await authed.post("/applications", json=_make_application_payload(company.id))
            assert create.status_code == 201
            app_id = create.json()["id"]

            resp = await authed.get(f"/applications/{app_id}")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["id"] == app_id
        assert body["user_id"] == user["id"]
        assert body["company_id"] == str(company.id)
        assert body["role_title"] == "Senior Backend Engineer"

    @pytest.mark.asyncio
    async def test_other_users_application_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        company = await _create_company(db, uuid.UUID(owner["id"]), "Owner Co")

        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/applications", json=_make_application_payload(company.id))
            assert create.status_code == 201
            app_id = create.json()["id"]

        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.get(f"/applications/{app_id}")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_soft_deleted_application_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Ghost Co")

        async with await as_user(user) as authed:
            create = await authed.post("/applications", json=_make_application_payload(company.id))
            assert create.status_code == 201
            app_id = create.json()["id"]

            delete_resp = await authed.delete(f"/applications/{app_id}")
            assert delete_resp.status_code == 204

            resp = await authed.get(f"/applications/{app_id}")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.get(f"/applications/{uuid.uuid4()}")
        assert resp.status_code == 401
