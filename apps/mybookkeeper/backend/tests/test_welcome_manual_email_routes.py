"""End-to-end route tests for POST /welcome-manuals/{id}/email.

Exercises the real email-orchestration service through the route against the
SQLite test DB, with the SMTP transport (``email_service.send_email``) and
configuration check monkeypatched. Asserts the send-log row is persisted with
the right status, the recipient is recorded, and the host's email is passed as
``reply_to``.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.models.welcome_manuals.welcome_manual import WelcomeManual
from app.repositories.welcome_manuals import welcome_manual_send_repo
from app.services.welcome_manuals import welcome_manual_email_service


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)


def _override_auth(org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
    app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)


def _wire_db(monkeypatch: pytest.MonkeyPatch, db: AsyncSession) -> None:
    """Point the service's ``unit_of_work`` at the existing test session so the
    service reads + writes against the same SQLite DB the test seeded."""
    @asynccontextmanager
    async def _fake_uow():
        yield db

    monkeypatch.setattr(
        "app.services.welcome_manuals.welcome_manual_email_service.unit_of_work",
        _fake_uow,
    )


async def _seed_manual(
    db: AsyncSession, *, org: Organization, user: User,
) -> WelcomeManual:
    m = WelcomeManual(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        title="Beach House Guide",
        intro_text="Welcome!",
    )
    db.add(m)
    await db.commit()
    return m


class TestAuth:
    def test_requires_auth(self) -> None:
        # No dependency override → the real auth dependency rejects.
        client = TestClient(app)
        resp = client.post(
            f"/welcome-manuals/{uuid.uuid4()}/email",
            json={"recipient_email": "g@example.com"},
        )
        assert resp.status_code == 401


class TestValidationAndNotFound:
    @pytest.mark.asyncio
    async def test_invalid_email_422(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        manual = await _seed_manual(db, org=test_org, user=test_user)
        _wire_db(monkeypatch, db)
        _override_auth(test_org.id, test_user.id)
        try:
            client = TestClient(app)
            resp = client.post(
                f"/welcome-manuals/{manual.id}/email",
                json={"recipient_email": "not-an-email"},
            )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_missing_manual_404(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _wire_db(monkeypatch, db)
        _override_auth(test_org.id, test_user.id)
        try:
            client = TestClient(app)
            resp = client.post(
                f"/welcome-manuals/{uuid.uuid4()}/email",
                json={"recipient_email": "g@example.com"},
            )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_other_org_manual_404(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        manual = await _seed_manual(db, org=test_org, user=test_user)
        _wire_db(monkeypatch, db)
        # Authenticate as a DIFFERENT org — the org-scoped load must 404.
        _override_auth(uuid.uuid4(), test_user.id)
        try:
            client = TestClient(app)
            resp = client.post(
                f"/welcome-manuals/{manual.id}/email",
                json={"recipient_email": "g@example.com"},
            )
        finally:
            app.dependency_overrides.clear()
        assert resp.status_code == 404


class TestSendOutcomes:
    @pytest.mark.asyncio
    async def test_success_records_sent_and_passes_reply_to_host(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        manual = await _seed_manual(db, org=test_org, user=test_user)
        _wire_db(monkeypatch, db)
        monkeypatch.setattr(
            welcome_manual_email_service.email_service, "is_configured",
            lambda: True,
        )
        captured: dict[str, object] = {}

        def _fake_send(to, subject, body_html, *, attachments=None, reply_to=None):
            captured["to"] = to
            captured["subject"] = subject
            captured["attachments"] = attachments
            captured["reply_to"] = reply_to
            return True

        monkeypatch.setattr(
            welcome_manual_email_service.email_service, "send_email", _fake_send,
        )

        _override_auth(test_org.id, test_user.id)
        try:
            client = TestClient(app)
            resp = client.post(
                f"/welcome-manuals/{manual.id}/email",
                json={"recipient_email": "guest@example.com", "recipient_name": "Jane"},
            )
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "sent"
        assert body["recipient_email"] == "guest@example.com"
        assert body["recipient_name"] == "Jane"
        assert body["error_reason"] is None

        # The host's own login email was passed as Reply-To.
        assert captured["reply_to"] == test_user.email
        assert captured["to"] == ["guest@example.com"]
        # A single PDF attachment was built.
        attachments = captured["attachments"]
        assert attachments is not None and len(attachments) == 1
        assert attachments[0].content_type == "application/pdf"
        assert attachments[0].content.startswith(b"%PDF")

        # A send-log row was persisted with the recipient + status.
        rows = await welcome_manual_send_repo.list_by_manual(db, manual.id)
        assert len(rows) == 1
        assert rows[0].status == "sent"
        assert rows[0].recipient_email == "guest@example.com"
        assert rows[0].recipient_name == "Jane"

    @pytest.mark.asyncio
    async def test_smtp_not_configured_records_skipped(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        manual = await _seed_manual(db, org=test_org, user=test_user)
        _wire_db(monkeypatch, db)
        monkeypatch.setattr(
            welcome_manual_email_service.email_service, "is_configured",
            lambda: False,
        )
        # send_email must NOT be called when unconfigured.
        def _explode(*a, **k):  # pragma: no cover - asserts it's never called
            raise AssertionError("send_email should not be called when SMTP unconfigured")

        monkeypatch.setattr(
            welcome_manual_email_service.email_service, "send_email", _explode,
        )

        _override_auth(test_org.id, test_user.id)
        try:
            client = TestClient(app)
            resp = client.post(
                f"/welcome-manuals/{manual.id}/email",
                json={"recipient_email": "guest@example.com"},
            )
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "skipped"
        assert body["error_reason"] == "smtp_not_configured"

        rows = await welcome_manual_send_repo.list_by_manual(db, manual.id)
        assert len(rows) == 1
        assert rows[0].status == "skipped"

    @pytest.mark.asyncio
    async def test_send_failure_records_failed(
        self, db: AsyncSession, test_user: User, test_org: Organization,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        manual = await _seed_manual(db, org=test_org, user=test_user)
        _wire_db(monkeypatch, db)
        monkeypatch.setattr(
            welcome_manual_email_service.email_service, "is_configured",
            lambda: True,
        )
        monkeypatch.setattr(
            welcome_manual_email_service.email_service, "send_email",
            lambda *a, **k: False,
        )

        _override_auth(test_org.id, test_user.id)
        try:
            client = TestClient(app)
            resp = client.post(
                f"/welcome-manuals/{manual.id}/email",
                json={"recipient_email": "guest@example.com"},
            )
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "failed"
        assert body["error_reason"] == "send_failed"

        rows = await welcome_manual_send_repo.list_by_manual(db, manual.id)
        assert len(rows) == 1
        assert rows[0].status == "failed"
