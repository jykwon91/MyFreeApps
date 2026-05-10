"""HTTP route tests for POST /signed-leases/{lease_id}/extend.

Service-layer behavior is covered in test_lease_extension_service.
This file isolates the route: status code + body translation, background
task scheduling, and permission gating.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.leases.signed_lease_response import SignedLeaseResponse
from app.services.leases import lease_extension_service


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _stub_detail(lease_id: uuid.UUID, ends_on: _dt.date) -> SignedLeaseResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return SignedLeaseResponse(
        id=lease_id,
        user_id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        templates=[],
        applicant_id=uuid.uuid4(),
        kind="generated",
        values={},
        status="active",
        starts_on=_dt.date(2026, 1, 1),
        ends_on=ends_on,
        created_at=now,
        updated_at=now,
        attachments=[],
    )


class TestExtendLeaseRoute:
    def test_happy_path_returns_200_with_updated_lease(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        lease_id = uuid.uuid4()
        new_end = _dt.date(2027, 6, 30)
        detail = _stub_detail(lease_id, new_end)

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.extend_lease",
                new_callable=AsyncMock,
                return_value=(detail, _dt.datetime.now(_dt.timezone.utc)),
            ) as mock_svc:
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{lease_id}/extend",
                    json={"new_ends_on": "2027-06-30", "notes": "Six-month renewal"},
                )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["id"] == str(lease_id)
            assert body["ends_on"] == "2027-06-30"
            kwargs = mock_svc.call_args.kwargs
            assert kwargs["user_id"] == user_id
            assert kwargs["organization_id"] == org_id
            assert kwargs["lease_id"] == lease_id
            assert kwargs["new_ends_on"] == new_end
            assert kwargs["notes"] == "Six-month renewal"
        finally:
            app.dependency_overrides.clear()

    def test_not_found_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.extend_lease",
                new_callable=AsyncMock,
                side_effect=lease_extension_service.SignedLeaseNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{uuid.uuid4()}/extend",
                    json={"new_ends_on": "2027-06-30"},
                )
            assert response.status_code == 404
            assert response.json()["detail"] == "Lease not found"
        finally:
            app.dependency_overrides.clear()

    def test_invalid_status_returns_409_with_code(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.extend_lease",
                new_callable=AsyncMock,
                side_effect=(
                    lease_extension_service.InvalidLeaseStatusForExtensionError(
                        "lease is in draft"
                    )
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{uuid.uuid4()}/extend",
                    json={"new_ends_on": "2027-06-30"},
                )
            assert response.status_code == 409
            body = response.json()
            assert body["detail"]["code"] == "INVALID_STATUS_FOR_EXTENSION"
        finally:
            app.dependency_overrides.clear()

    def test_new_end_not_after_returns_409(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.extend_lease",
                new_callable=AsyncMock,
                side_effect=(
                    lease_extension_service.NewEndDateNotAfterCurrentError(
                        "must be after"
                    )
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{uuid.uuid4()}/extend",
                    json={"new_ends_on": "2026-12-30"},
                )
            assert response.status_code == 409
            body = response.json()
            assert body["detail"]["code"] == "NEW_END_DATE_NOT_AFTER_CURRENT"
        finally:
            app.dependency_overrides.clear()

    def test_missing_current_end_returns_409(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.extend_lease",
                new_callable=AsyncMock,
                side_effect=(
                    lease_extension_service.MissingCurrentEndDateError("no ends_on")
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{uuid.uuid4()}/extend",
                    json={"new_ends_on": "2027-06-30"},
                )
            assert response.status_code == 409
            assert response.json()["detail"]["code"] == "MISSING_CURRENT_END_DATE"
        finally:
            app.dependency_overrides.clear()

    def test_missing_new_ends_on_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/signed-leases/{uuid.uuid4()}/extend",
                json={"notes": "no date"},
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_extra_field_returns_422(self) -> None:
        """extra='forbid' on ExtendLeaseRequest blocks unknown fields."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/signed-leases/{uuid.uuid4()}/extend",
                json={
                    "new_ends_on": "2027-06-30",
                    "evil_field": "injection",
                },
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_email_tenant_true_schedules_background_task(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        lease_id = uuid.uuid4()
        detail = _stub_detail(lease_id, _dt.date(2027, 6, 30))

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.extend_lease",
                new_callable=AsyncMock,
                return_value=(detail, _dt.datetime.now(_dt.timezone.utc)),
            ), patch(
                "app.api.signed_leases.send_lease_to_tenant",
                new_callable=AsyncMock,
            ) as mock_send:
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{lease_id}/extend",
                    json={"new_ends_on": "2027-06-30", "email_tenant": True},
                )
            assert response.status_code == 200
            # TestClient runs background tasks synchronously after the response;
            # the send_lease_to_tenant patch should have been awaited once.
            assert mock_send.await_count == 1
            assert mock_send.await_args.kwargs == {
                "lease_id": lease_id,
                "user_id": user_id,
                "organization_id": org_id,
            }
        finally:
            app.dependency_overrides.clear()

    def test_email_tenant_false_skips_background_task(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        lease_id = uuid.uuid4()
        detail = _stub_detail(lease_id, _dt.date(2027, 6, 30))

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.extend_lease",
                new_callable=AsyncMock,
                return_value=(detail, _dt.datetime.now(_dt.timezone.utc)),
            ), patch(
                "app.api.signed_leases.send_lease_to_tenant",
                new_callable=AsyncMock,
            ) as mock_send:
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{lease_id}/extend",
                    json={"new_ends_on": "2027-06-30"},  # email_tenant defaults False
                )
            assert response.status_code == 200
            assert mock_send.await_count == 0
        finally:
            app.dependency_overrides.clear()

    def test_viewer_returns_403(self) -> None:
        app.dependency_overrides[require_write_access] = lambda: (
            (_ for _ in ()).throw(
                __import__("fastapi").HTTPException(
                    status_code=403, detail="Viewers have read-only access",
                )
            )
        )
        try:
            client = TestClient(app)
            response = client.post(
                f"/signed-leases/{uuid.uuid4()}/extend",
                json={"new_ends_on": "2027-06-30"},
            )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.post(
            f"/signed-leases/{uuid.uuid4()}/extend",
            json={"new_ends_on": "2027-06-30"},
        )
        assert response.status_code == 401
