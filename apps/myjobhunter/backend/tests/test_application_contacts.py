"""Tests for ``application_contacts`` endpoints (Phase 2).

Covers:
- ``POST /applications/{id}/contacts``: happy path 201 + payload, schema
  validation (422), unauthenticated (401), cross-tenant (404), extra-field
  rejection, at-least-one-of-name-or-email validation.
- ``DELETE /applications/{id}/contacts/{cid}``: happy path 204, cross-tenant
  (404), wrong application_id IDOR guard (404), unauthenticated (401),
  non-existent contact (404).
- ``GET /applications/{id}``: contacts list embedded in detail response.

IDOR guard tests explicitly verify that a caller who knows a valid ``contact_id``
but does not own the parent ``application_id`` receives 404, not 204.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_company(db: AsyncSession, user_id: uuid.UUID, name: str) -> Company:
    company = Company(
        user_id=user_id,
        name=name,
        primary_domain=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}.example",
    )
    db.add(company)
    await db.flush()
    return company


def _app_payload(company_id: uuid.UUID) -> dict:
    return {
        "company_id": str(company_id),
        "role_title": "Senior Backend Engineer",
        "source": "linkedin",
        "remote_type": "remote",
    }


def _contact_payload(**overrides) -> dict:
    payload: dict = {
        "name": "Alice Recruiter",
        "email": "alice@example.com",
        "role": "recruiter",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# POST /applications/{id}/contacts
# ---------------------------------------------------------------------------


class TestCreateContact:
    @pytest.mark.asyncio
    async def test_happy_path_returns_201_with_payload(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            assert create_app.status_code == 201
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/contacts",
                json=_contact_payload(),
            )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["application_id"] == app_id
        assert body["user_id"] == user["id"]
        assert body["name"] == "Alice Recruiter"
        assert body["email"] == "alice@example.com"
        assert body["role"] == "recruiter"
        assert "id" in body
        assert "created_at" in body

    @pytest.mark.asyncio
    async def test_name_only_is_valid(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """A contact with only ``name`` (no ``email``) is valid."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/contacts",
                json={"name": "Bob HM"},
            )

        assert resp.status_code == 201, resp.text
        assert resp.json()["name"] == "Bob HM"
        assert resp.json()["email"] is None

    @pytest.mark.asyncio
    async def test_email_only_is_valid(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """A contact with only ``email`` (no ``name``) is valid."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/contacts",
                json={"email": "recruiter@acme.com"},
            )

        assert resp.status_code == 201, resp.text
        assert resp.json()["email"] == "recruiter@acme.com"

    @pytest.mark.asyncio
    async def test_neither_name_nor_email_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """At least one of name or email is required."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/contacts",
                json={"role": "recruiter", "notes": "Met at conference"},
            )

        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_invalid_role_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/contacts",
                json=_contact_payload(role="boss"),
            )

        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_extra_field_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """``extra='forbid'`` rejects unknown fields with 422."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            payload = _contact_payload()
            payload["user_id"] = str(uuid.uuid4())  # injection attempt

            resp = await authed.post(f"/applications/{app_id}/contacts", json=payload)

        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_cross_tenant_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Cannot add a contact to another user's application."""
        owner = await user_factory()
        attacker = await user_factory()
        company = await _create_company(db, uuid.UUID(owner["id"]), "Acme")

        async with await as_user(owner) as owner_client:
            create_app = await owner_client.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

        async with await as_user(attacker) as attacker_client:
            resp = await attacker_client.post(
                f"/applications/{app_id}/contacts",
                json=_contact_payload(),
            )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post(
            f"/applications/{uuid.uuid4()}/contacts",
            json=_contact_payload(),
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /applications/{id}/contacts/{cid}
# ---------------------------------------------------------------------------


class TestDeleteContact:
    @pytest.mark.asyncio
    async def test_happy_path_returns_204(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            create_contact = await authed.post(
                f"/applications/{app_id}/contacts",
                json=_contact_payload(),
            )
            assert create_contact.status_code == 201
            contact_id = create_contact.json()["id"]

            resp = await authed.delete(f"/applications/{app_id}/contacts/{contact_id}")

        assert resp.status_code == 204
        assert resp.content == b""

    @pytest.mark.asyncio
    async def test_deleted_contact_not_in_detail(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """After DELETE, the contact is no longer in GET /applications/{id} response."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            create_contact = await authed.post(
                f"/applications/{app_id}/contacts",
                json=_contact_payload(),
            )
            contact_id = create_contact.json()["id"]

            # Detail shows the contact.
            detail_before = await authed.get(f"/applications/{app_id}")
            assert any(c["id"] == contact_id for c in detail_before.json()["contacts"])

            await authed.delete(f"/applications/{app_id}/contacts/{contact_id}")

            # Detail no longer shows the contact.
            detail_after = await authed.get(f"/applications/{app_id}")
            assert not any(c["id"] == contact_id for c in detail_after.json()["contacts"])

    @pytest.mark.asyncio
    async def test_nonexistent_contact_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            resp = await authed.delete(f"/applications/{app_id}/contacts/{uuid.uuid4()}")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cross_tenant_contact_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Attacker cannot delete the owner's contact even with the correct contact_id."""
        owner = await user_factory()
        attacker = await user_factory()
        company = await _create_company(db, uuid.UUID(owner["id"]), "Acme")

        async with await as_user(owner) as owner_client:
            create_app = await owner_client.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            create_contact = await owner_client.post(
                f"/applications/{app_id}/contacts",
                json=_contact_payload(),
            )
            contact_id = create_contact.json()["id"]

        async with await as_user(attacker) as attacker_client:
            # Attacker uses the real contact_id and real app_id — should still fail.
            resp = await attacker_client.delete(
                f"/applications/{app_id}/contacts/{contact_id}"
            )

        assert resp.status_code == 404
        # Owner's contact is unaffected — verify via owner's GET detail.
        async with await as_user(owner) as owner_client:
            detail = await owner_client.get(f"/applications/{app_id}")
        assert any(c["id"] == contact_id for c in detail.json()["contacts"])

    @pytest.mark.asyncio
    async def test_idor_wrong_application_id_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """IDOR guard: correct contact_id with a different (owned) application_id → 404.

        The composite WHERE (contact_id AND application_id AND user_id) is the
        primary IDOR guard.  This test exercises the application_id mismatch
        case specifically — a caller who knows a contact's UUID but passes the
        wrong application_id in the URL cannot reach it.
        """
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")
        company_b = await _create_company(db, uuid.UUID(user["id"]), "Beta")

        async with await as_user(user) as authed:
            app_a = (await authed.post("/applications", json=_app_payload(company.id))).json()["id"]
            app_b = (await authed.post("/applications", json=_app_payload(company_b.id))).json()["id"]

            create_contact = await authed.post(
                f"/applications/{app_a}/contacts",
                json=_contact_payload(),
            )
            contact_id = create_contact.json()["id"]

            # Use app_b's URL with app_a's contact_id → should 404 (wrong application_id).
            resp = await authed.delete(f"/applications/{app_b}/contacts/{contact_id}")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.delete(
            f"/applications/{uuid.uuid4()}/contacts/{uuid.uuid4()}"
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /applications/{id} — contacts embedded in detail response
# ---------------------------------------------------------------------------


class TestApplicationDetailWithContacts:
    @pytest.mark.asyncio
    async def test_detail_includes_contacts(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """GET /applications/{id} returns contacts list in the response body."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            await authed.post(
                f"/applications/{app_id}/contacts",
                json={"name": "Alice", "role": "recruiter"},
            )
            await authed.post(
                f"/applications/{app_id}/contacts",
                json={"name": "Bob", "role": "hiring_manager"},
            )

            detail = await authed.get(f"/applications/{app_id}")

        assert detail.status_code == 200, detail.text
        body = detail.json()
        assert "contacts" in body
        assert len(body["contacts"]) == 2
        names = {c["name"] for c in body["contacts"]}
        assert names == {"Alice", "Bob"}

    @pytest.mark.asyncio
    async def test_detail_includes_events(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """GET /applications/{id} returns events list newest-first.

        POST /applications auto-creates a source=system 'applied' event.
        Two additional manual events are logged at past timestamps so the
        auto-event (at now) lands first in the newest-first list.
        """
        import datetime as _dt

        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            await authed.post(
                f"/applications/{app_id}/events",
                json={
                    "event_type": "applied",
                    "occurred_at": _dt.datetime(2024, 1, 1, tzinfo=_dt.timezone.utc).isoformat(),
                    "source": "manual",
                },
            )
            await authed.post(
                f"/applications/{app_id}/events",
                json={
                    "event_type": "interview_scheduled",
                    "occurred_at": _dt.datetime(2024, 2, 1, tzinfo=_dt.timezone.utc).isoformat(),
                    "source": "manual",
                },
            )

            detail = await authed.get(f"/applications/{app_id}")

        assert detail.status_code == 200, detail.text
        body = detail.json()
        assert "events" in body
        # 3 events: auto-applied (now) + interview_scheduled (2024-02) + applied (2024-01)
        assert len(body["events"]) == 3
        # Newest first — auto-event (now) is most recent.
        assert body["events"][0]["event_type"] == "applied"
        assert body["events"][0]["source"] == "system"
        assert body["events"][1]["event_type"] == "interview_scheduled"
        assert body["events"][2]["event_type"] == "applied"
        assert body["events"][2]["source"] == "manual"

    @pytest.mark.asyncio
    async def test_detail_initial_event_on_new_application(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """A brand-new application has the auto-applied event and empty contacts."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            detail = await authed.get(f"/applications/{app_id}")

        body = detail.json()
        # The auto 'applied' event is created on POST.
        assert len(body["events"]) == 1
        assert body["events"][0]["event_type"] == "applied"
        assert body["events"][0]["source"] == "system"
        # No contacts yet.
        assert body["contacts"] == []
