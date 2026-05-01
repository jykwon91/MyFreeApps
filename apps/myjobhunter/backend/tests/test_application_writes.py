"""Application CRUD write tests (PR 2.1a — Phase 2 first slice).

Covers POST / PATCH / DELETE on ``/applications``:

- Happy paths return the documented status codes (201 / 200 / 204) and
  payloads.
- Tenant isolation: user A cannot read, update, or delete user B's rows.
  Cross-tenant probes return 404 — the same response a genuinely missing row
  yields, so callers can't distinguish "doesn't exist" from "not yours".
- Allowlist defenses: a PATCH body trying to set ``user_id`` is rejected at
  the schema layer (``extra='forbid'``) with HTTP 422.
- Soft-delete semantics: ``deleted_at`` is populated, the row disappears
  from list / detail, and a second DELETE on the same row is idempotent
  (still 204).
- ``company_id`` ownership: POST and PATCH reject attempts to link the
  application to a company the caller does not own (HTTP 422 with a
  generic detail string — no existence leak).
- Audit: at least one ``audit_logs`` row is written for an application
  INSERT (verified via the dedicated audit_session fixture pattern from
  ``test_audit.py``, which bypasses the rolled-back-transaction conftest
  fixture so the listener's after-flush queue can commit cleanly).

The conftest fixtures (``client``, ``user_factory``, ``as_user``) provide
authenticated httpx clients. The route handlers commit explicitly (matching
``app.api.totp``) — the conftest's ``user_factory`` cleanup hard-deletes
the test users via a fresh engine, and ``ON DELETE CASCADE`` on
``applications.user_id`` and ``companies.user_id`` clears the related
rows. The audit assertion uses its own committed-mode session per the
pattern in ``test_audit.py``.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.audit import current_user_id, register_audit_listeners
from app.core.config import settings
from app.models.application.application import Application
from app.models.company.company import Company
from app.models.user.user import User
from app.repositories.application import application_repository
from platform_shared.db.models.audit_log import AuditLog


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_company(db: AsyncSession, user_id: uuid.UUID, name: str) -> Company:
    """Create a Company committed via the test DB session.

    The conftest ``db`` fixture wraps the session in a rolled-back transaction
    so the row is invisible to other engines, but inserting via the same
    session makes the row visible to the route handlers (which receive the
    same overridden ``get_db`` session).
    """
    company = Company(
        user_id=user_id,
        name=name,
        primary_domain=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}.example",
    )
    db.add(company)
    await db.flush()
    return company


def _make_create_payload(company_id: uuid.UUID, **overrides: Any) -> dict[str, Any]:
    """Return a valid ApplicationCreateRequest body — overridable per test."""
    payload: dict[str, Any] = {
        "company_id": str(company_id),
        "role_title": "Senior Backend Engineer",
        "remote_type": "remote",
        "source": "linkedin",
        "posted_salary_currency": "USD",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# POST /applications
# ---------------------------------------------------------------------------


class TestCreateApplication:
    @pytest.mark.asyncio
    async def test_create_happy_path_returns_201(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme Corp")

        async with await as_user(user) as authed:
            resp = await authed.post(
                "/applications",
                json=_make_create_payload(company.id),
            )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["user_id"] == user["id"]
        assert body["company_id"] == str(company.id)
        assert body["role_title"] == "Senior Backend Engineer"
        assert body["source"] == "linkedin"
        assert body["remote_type"] == "remote"
        assert body["archived"] is False
        assert body["deleted_at"] is None
        assert "id" in body
        assert "created_at" in body

    @pytest.mark.asyncio
    async def test_create_with_other_users_company_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        company = await _create_company(db, uuid.UUID(owner["id"]), "Owners Co")

        async with await as_user(attacker) as authed:
            resp = await authed.post(
                "/applications",
                json=_make_create_payload(company.id),
            )

        # 422 with generic detail — no existence leak.
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == "company_id does not reference an accessible company"

    @pytest.mark.asyncio
    async def test_create_with_nonexistent_company_returns_422(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/applications",
                json=_make_create_payload(uuid.uuid4()),
            )
        assert resp.status_code == 422
        assert resp.json()["detail"] == "company_id does not reference an accessible company"

    @pytest.mark.asyncio
    async def test_create_malformed_body_returns_422(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            # Missing required ``role_title`` and ``company_id``.
            resp = await authed.post("/applications", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_rejects_extra_fields(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")
        payload = _make_create_payload(company.id, user_id=str(uuid.uuid4()))

        async with await as_user(user) as authed:
            resp = await authed.post("/applications", json=payload)

        # ``extra='forbid'`` → 422.
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_rejects_invalid_remote_type(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")
        payload = _make_create_payload(company.id, remote_type="hovercraft")

        async with await as_user(user) as authed:
            resp = await authed.post("/applications", json=payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_rejects_inverted_salary_band(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")
        payload = _make_create_payload(
            company.id,
            posted_salary_min=200000,
            posted_salary_max=100000,
        )

        async with await as_user(user) as authed:
            resp = await authed.post("/applications", json=payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/applications",
            json=_make_create_payload(uuid.uuid4()),
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /applications/{id}
# ---------------------------------------------------------------------------


class TestUpdateApplication:
    @pytest.mark.asyncio
    async def test_patch_happy_path_returns_200(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_resp = await authed.post(
                "/applications",
                json=_make_create_payload(company.id),
            )
            assert create_resp.status_code == 201
            app_id = create_resp.json()["id"]

            patch_resp = await authed.patch(
                f"/applications/{app_id}",
                json={"role_title": "Staff Backend Engineer", "archived": True},
            )

        assert patch_resp.status_code == 200, patch_resp.text
        body = patch_resp.json()
        assert body["role_title"] == "Staff Backend Engineer"
        assert body["archived"] is True
        # Untouched fields preserved.
        assert body["source"] == "linkedin"

    @pytest.mark.asyncio
    async def test_patch_other_users_application_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        company = await _create_company(db, uuid.UUID(owner["id"]), "Owner Co")

        async with await as_user(owner) as owner_client:
            create_resp = await owner_client.post(
                "/applications",
                json=_make_create_payload(company.id),
            )
            assert create_resp.status_code == 201
            app_id = create_resp.json()["id"]

        async with await as_user(attacker) as attacker_client:
            patch_resp = await attacker_client.patch(
                f"/applications/{app_id}",
                json={"role_title": "pwned"},
            )

        assert patch_resp.status_code == 404
        assert patch_resp.json()["detail"] == "Application not found"

    @pytest.mark.asyncio
    async def test_patch_cannot_change_user_id(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        other = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_resp = await authed.post(
                "/applications",
                json=_make_create_payload(company.id),
            )
            app_id = create_resp.json()["id"]

            # ``extra='forbid'`` rejects unknown keys with 422.
            patch_resp = await authed.patch(
                f"/applications/{app_id}",
                json={"user_id": other["id"]},
            )

        assert patch_resp.status_code == 422

    @pytest.mark.asyncio
    async def test_patch_to_other_users_company_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        owner = await user_factory()
        other = await user_factory()
        owner_company = await _create_company(db, uuid.UUID(owner["id"]), "Mine")
        other_company = await _create_company(db, uuid.UUID(other["id"]), "Theirs")

        async with await as_user(owner) as authed:
            create_resp = await authed.post(
                "/applications",
                json=_make_create_payload(owner_company.id),
            )
            app_id = create_resp.json()["id"]

            patch_resp = await authed.patch(
                f"/applications/{app_id}",
                json={"company_id": str(other_company.id)},
            )

        assert patch_resp.status_code == 422
        assert patch_resp.json()["detail"] == "company_id does not reference an accessible company"

    @pytest.mark.asyncio
    async def test_patch_nonexistent_returns_404(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.patch(
                f"/applications/{uuid.uuid4()}",
                json={"role_title": "ghost"},
            )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /applications/{id}
# ---------------------------------------------------------------------------


class TestDeleteApplication:
    @pytest.mark.asyncio
    async def test_delete_happy_path_returns_204(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_resp = await authed.post(
                "/applications",
                json=_make_create_payload(company.id),
            )
            app_id = create_resp.json()["id"]

            delete_resp = await authed.delete(f"/applications/{app_id}")

        assert delete_resp.status_code == 204
        assert delete_resp.content == b""

        # ``deleted_at`` populated on the row.
        application = await application_repository.get_by_id(
            db, uuid.UUID(app_id), uuid.UUID(user["id"]), include_deleted=True,
        )
        assert application is not None
        assert application.deleted_at is not None

    @pytest.mark.asyncio
    async def test_delete_removes_from_list(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_resp = await authed.post(
                "/applications",
                json=_make_create_payload(company.id),
            )
            app_id = create_resp.json()["id"]

            list_before = await authed.get("/applications")
            assert list_before.json()["total"] == 1

            await authed.delete(f"/applications/{app_id}")

            list_after = await authed.get("/applications")
            assert list_after.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_delete_already_deleted_is_idempotent(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_resp = await authed.post(
                "/applications",
                json=_make_create_payload(company.id),
            )
            app_id = create_resp.json()["id"]

            first = await authed.delete(f"/applications/{app_id}")
            second = await authed.delete(f"/applications/{app_id}")

        assert first.status_code == 204
        assert second.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_other_users_application_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        company = await _create_company(db, uuid.UUID(owner["id"]), "Owner Co")

        async with await as_user(owner) as owner_client:
            create_resp = await owner_client.post(
                "/applications",
                json=_make_create_payload(company.id),
            )
            app_id = create_resp.json()["id"]

        async with await as_user(attacker) as attacker_client:
            delete_resp = await attacker_client.delete(f"/applications/{app_id}")

        assert delete_resp.status_code == 404

        # Owner's row is untouched.
        application = await application_repository.get_by_id(
            db, uuid.UUID(app_id), uuid.UUID(owner["id"]),
        )
        assert application is not None
        assert application.deleted_at is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_returns_404(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.delete(f"/applications/{uuid.uuid4()}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tenant isolation across the full CRUD surface
# ---------------------------------------------------------------------------


class TestTenantIsolation:
    @pytest.mark.asyncio
    async def test_users_lists_are_disjoint(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user_a = await user_factory()
        user_b = await user_factory()
        company_a = await _create_company(db, uuid.UUID(user_a["id"]), "A Co")
        company_b = await _create_company(db, uuid.UUID(user_b["id"]), "B Co")

        async with await as_user(user_a) as a_client:
            await a_client.post("/applications", json=_make_create_payload(company_a.id))
        async with await as_user(user_b) as b_client:
            await b_client.post("/applications", json=_make_create_payload(company_b.id))

        async with await as_user(user_a) as a_client:
            a_list = await a_client.get("/applications")
        async with await as_user(user_b) as b_client:
            b_list = await b_client.get("/applications")

        # Each user sees their own row (total=1) — no cross-tenant leakage.
        assert a_list.json()["total"] == 1
        assert b_list.json()["total"] == 1


# ---------------------------------------------------------------------------
# Audit listener integration
#
# The audit test attaches the listener locally — NOT via an autouse module
# fixture — so the rolled-back-transaction ``db`` fixture used by the rest
# of the file isn't entangled with the audit ``after_flush`` queue. Mirrors
# the per-fixture pattern in ``test_audit.py``.
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def audit_session() -> AsyncIterator[AsyncSession]:
    """Committed-mode session for asserting audit_logs writes.

    Bypasses the conftest ``db`` fixture's rolled-back-transaction pattern
    because the audit listener's after-flush queue interacts poorly with
    autobegin transactions held open across teardown. Cleans up its own rows.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    created_user_ids: list[uuid.UUID] = []

    async with sessionmaker() as session:
        session.info["created_user_ids"] = created_user_ids
        yield session

    async with sessionmaker() as cleanup:
        async with cleanup.begin():
            if created_user_ids:
                # Hard-delete users; CASCADE removes companies + applications.
                await cleanup.execute(delete(User).where(User.id.in_(created_user_ids)))
            # Best-effort sweep of audit rows we produced.
            await cleanup.execute(
                text(
                    "DELETE FROM audit_logs WHERE table_name "
                    "IN ('applications', 'companies', 'users')",
                ),
            )

    await engine.dispose()


class TestAuditOnCreate:
    @pytest.mark.asyncio
    async def test_create_application_emits_audit_log(
        self, audit_session: AsyncSession,
    ) -> None:
        """Inserting an Application via the listener-attached session writes
        at least one ``audit_logs`` row tagged with the actor user id."""
        # Attach the listener locally — idempotent at the
        # ``platform_shared`` registration boundary.
        register_audit_listeners()
        user = User(
            id=uuid.uuid4(),
            email=f"audit-app-{uuid.uuid4().hex[:8]}@example.com",
            hashed_password="x" * 60,
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        audit_session.add(user)
        await audit_session.commit()
        audit_session.info["created_user_ids"].append(user.id)

        company = Company(
            user_id=user.id,
            name="Acme Audit",
            primary_domain=f"acme-audit-{uuid.uuid4().hex[:6]}.example",
        )
        audit_session.add(company)
        await audit_session.commit()

        token = current_user_id.set(str(user.id))
        try:
            application = Application(
                user_id=user.id,
                company_id=company.id,
                role_title="Audit Test Engineer",
                remote_type="remote",
            )
            audit_session.add(application)
            await audit_session.commit()
        finally:
            current_user_id.reset(token)

        rows = (await audit_session.execute(
            select(AuditLog).where(AuditLog.table_name == "applications"),
        )).scalars().all()

        assert rows, "expected at least one audit_logs row for the inserted application"
        assert all(r.operation == "INSERT" for r in rows)
        assert all(r.changed_by == str(user.id) for r in rows)

        by_field = {r.field_name: r for r in rows}
        assert "role_title" in by_field
        assert by_field["role_title"].new_value == "Audit Test Engineer"
