"""Route tests for POST /signed-leases/{lease_id}/extensions/{version_id}/undo.

Service behavior is covered in test_lease_extension_undo_service. This
file isolates the route: status code + body translation, permission gating.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import AsyncMock, patch

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
        latest_extension=None,
    )


class TestUndoExtensionRoute:
    def test_happy_path_returns_200_with_rolled_back_lease(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        lease_id, version_id = uuid.uuid4(), uuid.uuid4()
        detail = _stub_detail(lease_id, _dt.date(2026, 12, 31))

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.undo_extension",
                new_callable=AsyncMock,
                return_value=detail,
            ) as mock_svc:
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{lease_id}/extensions/{version_id}/undo",
                )
            assert response.status_code == 200, response.text
            assert response.json()["id"] == str(lease_id)
            assert response.json()["ends_on"] == "2026-12-31"
            kwargs = mock_svc.call_args.kwargs
            assert kwargs["user_id"] == user_id
            assert kwargs["organization_id"] == org_id
            assert kwargs["lease_id"] == lease_id
            assert kwargs["version_id"] == version_id
        finally:
            app.dependency_overrides.clear()

    def test_lease_not_found_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.undo_extension",
                new_callable=AsyncMock,
                side_effect=lease_extension_service.SignedLeaseNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{uuid.uuid4()}/extensions/{uuid.uuid4()}/undo",
                )
            assert response.status_code == 404
            assert response.json()["detail"] == "Lease not found"
        finally:
            app.dependency_overrides.clear()

    def test_extension_not_found_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.undo_extension",
                new_callable=AsyncMock,
                side_effect=lease_extension_service.ExtensionNotFoundError("nope"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{uuid.uuid4()}/extensions/{uuid.uuid4()}/undo",
                )
            assert response.status_code == 404
            assert response.json()["detail"] == "Extension not found"
        finally:
            app.dependency_overrides.clear()

    def test_seed_row_returns_409(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.undo_extension",
                new_callable=AsyncMock,
                side_effect=lease_extension_service.CannotUndoSeedRowError("seed"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{uuid.uuid4()}/extensions/{uuid.uuid4()}/undo",
                )
            assert response.status_code == 409
            assert response.json()["detail"]["code"] == "CANNOT_UNDO_SEED_ROW"
        finally:
            app.dependency_overrides.clear()

    def test_not_latest_returns_409(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.undo_extension",
                new_callable=AsyncMock,
                side_effect=lease_extension_service.NotLatestExtensionError("nope"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{uuid.uuid4()}/extensions/{uuid.uuid4()}/undo",
                )
            assert response.status_code == 409
            assert response.json()["detail"]["code"] == "NOT_LATEST_EXTENSION"
        finally:
            app.dependency_overrides.clear()

    def test_window_expired_returns_409(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.lease_extension_service.undo_extension",
                new_callable=AsyncMock,
                side_effect=lease_extension_service.UndoWindowExpiredError("expired"),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/signed-leases/{uuid.uuid4()}/extensions/{uuid.uuid4()}/undo",
                )
            assert response.status_code == 409
            assert response.json()["detail"]["code"] == "UNDO_WINDOW_EXPIRED"
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
                f"/signed-leases/{uuid.uuid4()}/extensions/{uuid.uuid4()}/undo",
            )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.post(
            f"/signed-leases/{uuid.uuid4()}/extensions/{uuid.uuid4()}/undo",
        )
        assert response.status_code == 401
