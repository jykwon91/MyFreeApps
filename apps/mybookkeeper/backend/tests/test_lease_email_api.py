"""Route-level tests for the tenant-email signed-lease endpoints.

Covers:

- ``POST /signed-leases/{id}/email-tenant`` — manual queue endpoint:
  - 202 ``{"queued": true}`` happy path
  - 404 when the lease isn't visible
  - 422 ``"applicant_email_missing"`` when contact_email is unset
- ``POST /signed-leases/{id}/generate`` — auto-email scheduling:
  - Schedules the background task on first generate (previous_status=draft).
  - Does NOT schedule on Regenerate (previous_status=generated).

The service layer + background-task scheduling are mocked; this file
only verifies the route ↔ service contract.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.leases.signed_lease_response import SignedLeaseResponse


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _detail(
    lease_id: uuid.UUID,
    *,
    applicant_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    status: str = "generated",
) -> SignedLeaseResponse:
    return SignedLeaseResponse(
        id=lease_id,
        user_id=user_id,
        organization_id=org_id,
        templates=[],
        applicant_id=applicant_id,
        listing_id=None,
        kind="generated",
        values={},
        status=status,
        starts_on=None,
        ends_on=None,
        notes=None,
        generated_at=_dt.datetime.now(_dt.timezone.utc),
        sent_at=None,
        signed_at=None,
        ended_at=None,
        auto_email_tenant=True,
        last_emailed_to_tenant_at=None,
        created_at=_dt.datetime.now(_dt.timezone.utc),
        updated_at=_dt.datetime.now(_dt.timezone.utc),
        attachments=[],
    )


class TestEmailLeaseToTenantManual:
    def test_returns_202_when_queued(self) -> None:
        org_id, user_id, lease_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_email_service.assert_can_email_tenant",
                new_callable=AsyncMock,
                return_value=None,
            ), patch(
                "app.api.signed_leases.send_lease_to_tenant",
                new_callable=AsyncMock,
                return_value=True,
            ):
                client = TestClient(app)
                resp = client.post(f"/signed-leases/{lease_id}/email-tenant")
        finally:
            app.dependency_overrides.pop(require_write_access, None)

        assert resp.status_code == 202
        assert resp.json() == {"queued": True}

    def test_returns_404_when_lease_missing(self) -> None:
        from app.services.leases.lease_email_service import LeaseNotFoundError

        org_id, user_id, lease_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_email_service.assert_can_email_tenant",
                new_callable=AsyncMock,
                side_effect=LeaseNotFoundError("missing"),
            ):
                client = TestClient(app)
                resp = client.post(f"/signed-leases/{lease_id}/email-tenant")
        finally:
            app.dependency_overrides.pop(require_write_access, None)

        assert resp.status_code == 404

    def test_returns_422_when_applicant_email_missing(self) -> None:
        from app.services.leases.lease_email_service import (
            ApplicantEmailMissingError,
        )

        org_id, user_id, lease_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_email_service.assert_can_email_tenant",
                new_callable=AsyncMock,
                side_effect=ApplicantEmailMissingError("no email"),
            ):
                client = TestClient(app)
                resp = client.post(f"/signed-leases/{lease_id}/email-tenant")
        finally:
            app.dependency_overrides.pop(require_write_access, None)

        assert resp.status_code == 422
        body = resp.json()
        assert body.get("detail") == "applicant_email_missing"


class TestGenerateLeaseSchedulesAutoEmail:
    def test_schedules_background_task_on_first_generate(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id, lease_id = uuid.uuid4(), uuid.uuid4()
        detail = _detail(
            lease_id,
            applicant_id=applicant_id,
            org_id=org_id,
            user_id=user_id,
        )

        scheduled = MagicMock()

        # Patch BackgroundTasks.add_task on the route module so we can
        # assert it received our send function. FastAPI's BackgroundTasks
        # is constructed per-request; we monkeypatch the class method to
        # capture every add_task call across the test.
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.generate_lease",
                new_callable=AsyncMock,
                return_value=(detail, True),  # should_auto_email=True
            ), patch(
                "fastapi.background.BackgroundTasks.add_task",
                side_effect=lambda func, *a, **kw: scheduled(func, *a, **kw),
            ):
                client = TestClient(app)
                resp = client.post(f"/signed-leases/{lease_id}/generate")
        finally:
            app.dependency_overrides.pop(require_write_access, None)

        assert resp.status_code == 200
        scheduled.assert_called_once()
        # First positional arg is the callable
        called_func = scheduled.call_args.args[0]
        # Imported at top of route file as ``send_lease_to_tenant``
        from app.api.signed_leases import send_lease_to_tenant
        assert called_func is send_lease_to_tenant

    def test_does_not_schedule_on_regenerate(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id, lease_id = uuid.uuid4(), uuid.uuid4()
        detail = _detail(
            lease_id,
            applicant_id=applicant_id,
            org_id=org_id,
            user_id=user_id,
        )

        scheduled = MagicMock()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.generate_lease",
                new_callable=AsyncMock,
                return_value=(detail, False),  # should_auto_email=False
            ), patch(
                "fastapi.background.BackgroundTasks.add_task",
                side_effect=lambda func, *a, **kw: scheduled(func, *a, **kw),
            ):
                client = TestClient(app)
                resp = client.post(f"/signed-leases/{lease_id}/generate")
        finally:
            app.dependency_overrides.pop(require_write_access, None)

        assert resp.status_code == 200
        scheduled.assert_not_called()
