"""Company CRUD write tests (Phase 2.2).

Covers:
- POST /companies happy path returns 201 + payload.
- POST /companies rejects unauthenticated requests with 401.
- POST /companies returns 409 on duplicate (user_id, primary_domain).
- GET /companies returns the caller's items (not user B's).
- GET /companies/{id} returns 404 for cross-tenant access (no leak).
- PATCH /companies/{id} happy path returns 200 + updated fields.
- PATCH /companies/{id} returns 404 for cross-tenant access (no leak).
- PATCH /companies/{id} returns 409 on duplicate primary_domain.
- DELETE /companies/{id} hard-deletes and returns 204.
- DELETE /companies/{id} returns 404 for cross-tenant access (no leak).

Follows the same conftest fixtures pattern as test_application_writes.py.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_create_payload(**overrides) -> dict:
    payload = {
        "name": "Acme Corp",
        "primary_domain": "acme.example.com",
        "industry": "SaaS",
        "size_range": "11-50",
        "hq_location": "San Francisco, CA",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# POST /companies
# ---------------------------------------------------------------------------


class TestCreateCompany:
    @pytest.mark.asyncio
    async def test_create_happy_path_returns_201(self, user_factory, as_user) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            resp = await authed.post("/companies", json=_make_create_payload())

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["user_id"] == user["id"]
        assert body["name"] == "Acme Corp"
        assert body["primary_domain"] == "acme.example.com"
        assert body["industry"] == "SaaS"
        assert "id" in body
        assert "created_at" in body

    @pytest.mark.asyncio
    async def test_create_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post("/companies", json=_make_create_payload())
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_duplicate_primary_domain_returns_409(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            first = await authed.post(
                "/companies",
                json=_make_create_payload(name="Acme Corp"),
            )
            assert first.status_code == 201, first.text

            dup = await authed.post(
                "/companies",
                json=_make_create_payload(name="Acme Corp 2"),
            )

        assert dup.status_code == 409, dup.text

    @pytest.mark.asyncio
    async def test_create_rejects_extra_user_id_field(self, user_factory, as_user) -> None:
        user = await user_factory()
        attacker_target_user_id = str(uuid.uuid4())

        async with await as_user(user) as authed:
            resp = await authed.post(
                "/companies",
                json={**_make_create_payload(), "user_id": attacker_target_user_id},
            )

        # Pydantic extra='forbid' rejects with 422.
        assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# GET /companies + /companies/{id}
# ---------------------------------------------------------------------------


class TestReadCompanies:
    @pytest.mark.asyncio
    async def test_list_returns_caller_items(self, user_factory, as_user) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_create_payload())
            assert create.status_code == 201

            list_resp = await authed.get("/companies")

        assert list_resp.status_code == 200
        body = list_resp.json()
        assert body["total"] == 1
        assert len(body["items"]) == 1
        assert body["items"][0]["name"] == "Acme Corp"

    @pytest.mark.asyncio
    async def test_list_does_not_leak_other_users(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()

        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/companies", json=_make_create_payload())
            assert create.status_code == 201

        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.get("/companies")

        body = resp.json()
        assert body["total"] == 0
        assert body["items"] == []

    @pytest.mark.asyncio
    async def test_get_other_users_company_returns_404(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()

        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/companies", json=_make_create_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.get(f"/companies/{company_id}")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_returns_full_payload(self, user_factory, as_user) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_create_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

            resp = await authed.get(f"/companies/{company_id}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == company_id
        assert body["user_id"] == user["id"]
        assert body["name"] == "Acme Corp"


# ---------------------------------------------------------------------------
# PATCH /companies/{id}
# ---------------------------------------------------------------------------


class TestUpdateCompany:
    @pytest.mark.asyncio
    async def test_patch_happy_path_returns_200(self, user_factory, as_user) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_create_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

            resp = await authed.patch(
                f"/companies/{company_id}",
                json={"name": "Updated Corp", "industry": "FinTech"},
            )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["id"] == company_id
        assert body["name"] == "Updated Corp"
        assert body["industry"] == "FinTech"
        # Unchanged fields are preserved.
        assert body["primary_domain"] == "acme.example.com"

    @pytest.mark.asyncio
    async def test_patch_empty_body_is_noop(self, user_factory, as_user) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_create_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

            resp = await authed.patch(f"/companies/{company_id}", json={})

        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "Acme Corp"

    @pytest.mark.asyncio
    async def test_patch_other_users_company_returns_404(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()

        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/companies", json=_make_create_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.patch(
                f"/companies/{company_id}",
                json={"name": "Stolen Corp"},
            )

        assert resp.status_code == 404, resp.text

    @pytest.mark.asyncio
    async def test_patch_duplicate_primary_domain_returns_409(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            first = await authed.post(
                "/companies",
                json=_make_create_payload(name="Corp A", primary_domain="corp-a.example.com"),
            )
            assert first.status_code == 201

            second = await authed.post(
                "/companies",
                json=_make_create_payload(name="Corp B", primary_domain="corp-b.example.com"),
            )
            assert second.status_code == 201
            corp_b_id = second.json()["id"]

            # Try to update Corp B with Corp A's domain → conflict.
            resp = await authed.patch(
                f"/companies/{corp_b_id}",
                json={"primary_domain": "corp-a.example.com"},
            )

        assert resp.status_code == 409, resp.text

    @pytest.mark.asyncio
    async def test_patch_rejects_extra_user_id_field(self, user_factory, as_user) -> None:
        user = await user_factory()
        attacker_target_user_id = str(uuid.uuid4())

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_create_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

            resp = await authed.patch(
                f"/companies/{company_id}",
                json={"user_id": attacker_target_user_id},
            )

        # Pydantic extra='forbid' rejects with 422.
        assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# DELETE /companies/{id}
# ---------------------------------------------------------------------------


class TestDeleteCompany:
    @pytest.mark.asyncio
    async def test_delete_happy_path_returns_204(self, user_factory, as_user) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_create_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

            resp = await authed.delete(f"/companies/{company_id}")

        assert resp.status_code == 204, resp.text

    @pytest.mark.asyncio
    async def test_delete_removes_row(self, user_factory, as_user) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post("/companies", json=_make_create_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

            delete = await authed.delete(f"/companies/{company_id}")
            assert delete.status_code == 204

            # Row is gone — GET should return 404.
            get = await authed.get(f"/companies/{company_id}")

        assert get.status_code == 404, get.text

    @pytest.mark.asyncio
    async def test_delete_other_users_company_returns_404(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()

        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/companies", json=_make_create_payload())
            assert create.status_code == 201
            company_id = create.json()["id"]

        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.delete(f"/companies/{company_id}")

        assert resp.status_code == 404, resp.text
        # Owner's company is unaffected.
        async with await as_user(owner) as authed_owner:
            get = await authed_owner.get(f"/companies/{company_id}")
        assert get.status_code == 200, get.text

    @pytest.mark.asyncio
    async def test_delete_allows_reuse_of_domain(self, user_factory, as_user) -> None:
        """After deleting a company, the same primary_domain may be reused."""
        user = await user_factory()

        async with await as_user(user) as authed:
            create = await authed.post(
                "/companies",
                json=_make_create_payload(primary_domain="unique.example.com"),
            )
            assert create.status_code == 201
            company_id = create.json()["id"]

            delete = await authed.delete(f"/companies/{company_id}")
            assert delete.status_code == 204

            # Re-create with the same domain — should succeed now.
            recreate = await authed.post(
                "/companies",
                json=_make_create_payload(primary_domain="unique.example.com"),
            )

        assert recreate.status_code == 201, recreate.text
