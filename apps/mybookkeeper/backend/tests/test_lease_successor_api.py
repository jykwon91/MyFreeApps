"""Route tests for the parent_lease_id parameter on create + import.

Covers the structured 422 / 409 error code translation. Service-layer
validation is exercised in test_lease_successor_validation.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.services.leases import signed_lease_service


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


class TestCreateLeaseWithParent:
    def test_invalid_parent_returns_422_with_code(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.create_lease",
                new_callable=AsyncMock,
                side_effect=signed_lease_service.InvalidParentLeaseError(
                    "parent in draft",
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    "/signed-leases",
                    json={
                        "template_ids": [str(uuid.uuid4())],
                        "applicant_id": str(uuid.uuid4()),
                        "parent_lease_id": str(uuid.uuid4()),
                        "values": {},
                    },
                )
            assert response.status_code == 422, response.text
            assert response.json()["detail"]["code"] == "INVALID_PARENT_LEASE"
        finally:
            app.dependency_overrides.clear()

    def test_existing_successor_returns_409_with_code(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.create_lease",
                new_callable=AsyncMock,
                side_effect=signed_lease_service.SuccessorAlreadyExistsError(
                    "already has a successor",
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    "/signed-leases",
                    json={
                        "template_ids": [str(uuid.uuid4())],
                        "applicant_id": str(uuid.uuid4()),
                        "parent_lease_id": str(uuid.uuid4()),
                        "values": {},
                    },
                )
            assert response.status_code == 409, response.text
            assert response.json()["detail"]["code"] == "SUCCESSOR_ALREADY_EXISTS"
        finally:
            app.dependency_overrides.clear()


class TestImportLeaseWithParent:
    def test_invalid_parent_returns_422_with_code(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.import_signed_lease",
                new_callable=AsyncMock,
                side_effect=signed_lease_service.InvalidParentLeaseError(
                    "not found",
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    "/signed-leases/import",
                    data={
                        "applicant_id": str(uuid.uuid4()),
                        "parent_lease_id": str(uuid.uuid4()),
                        "status": "signed",
                    },
                    files=[("files", ("lease.pdf", b"%PDF-1.4 fake", "application/pdf"))],
                )
            assert response.status_code == 422, response.text
            assert response.json()["detail"]["code"] == "INVALID_PARENT_LEASE"
        finally:
            app.dependency_overrides.clear()

    def test_existing_successor_returns_409_with_code(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.import_signed_lease",
                new_callable=AsyncMock,
                side_effect=signed_lease_service.SuccessorAlreadyExistsError(
                    "already has a successor",
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    "/signed-leases/import",
                    data={
                        "applicant_id": str(uuid.uuid4()),
                        "parent_lease_id": str(uuid.uuid4()),
                        "status": "signed",
                    },
                    files=[("files", ("lease.pdf", b"%PDF-1.4 fake", "application/pdf"))],
                )
            assert response.status_code == 409, response.text
            assert response.json()["detail"]["code"] == "SUCCESSOR_ALREADY_EXISTS"
        finally:
            app.dependency_overrides.clear()
