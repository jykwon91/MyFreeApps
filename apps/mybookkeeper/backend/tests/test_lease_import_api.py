"""Route-level tests for POST /signed-leases/import.

The service layer is mocked — these tests focus on:
- Happy path: 1 PDF → lease returned with kind=imported, status=signed.
- Multi-file heuristic exercised via the service mock.
- Cross-tenant applicant → 404.
- Cross-tenant listing → 404.
- Disallowed content type → 415.
- Oversized file → 413.
- Storage not configured → 503.
- No files → 422.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from io import BytesIO
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _ok_lease_response(
    lease_id: uuid.UUID,
    applicant_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    kind: str = "imported",
    num_attachments: int = 1,
) -> dict:
    from app.schemas.leases.signed_lease_response import SignedLeaseResponse

    return SignedLeaseResponse(
        id=lease_id,
        user_id=user_id,
        organization_id=org_id,
        template_id=None,
        applicant_id=applicant_id,
        listing_id=None,
        kind=kind,
        values={},
        status="signed",
        starts_on=None,
        ends_on=None,
        notes=None,
        generated_at=None,
        sent_at=None,
        signed_at=_dt.datetime.now(_dt.timezone.utc),
        ended_at=None,
        created_at=_dt.datetime.now(_dt.timezone.utc),
        updated_at=_dt.datetime.now(_dt.timezone.utc),
        attachments=[
            _attachment(lease_id, i) for i in range(num_attachments)
        ],
    )


def _attachment(lease_id: uuid.UUID, i: int) -> dict:
    from app.schemas.leases.signed_lease_attachment_response import (
        SignedLeaseAttachmentResponse,
    )

    return SignedLeaseAttachmentResponse(
        id=uuid.uuid4(),
        lease_id=lease_id,
        storage_key=f"signed-leases/{lease_id}/att-{i}",
        filename=f"lease-{i}.pdf",
        content_type="application/pdf",
        size_bytes=1024,
        kind="signed_lease" if i == 0 else "signed_addendum",
        uploaded_by_user_id=uuid.uuid4(),
        uploaded_at=_dt.datetime.now(_dt.timezone.utc),
        presigned_url=None,
    )


# ---------------------------------------------------------------------------
# Happy path — single PDF
# ---------------------------------------------------------------------------

class TestImportSignedLease:
    def test_happy_path_single_pdf(self) -> None:
        org_id, user_id, applicant_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        lease_id = uuid.uuid4()
        expected = _ok_lease_response(lease_id, applicant_id, org_id, user_id)

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.import_signed_lease",
                new_callable=AsyncMock,
                return_value=expected,
            ):
                client = TestClient(app)
                resp = client.post(
                    "/signed-leases/import",
                    data={"applicant_id": str(applicant_id)},
                    files=[("files", ("lease.pdf", BytesIO(b"%PDF-1.4"), "application/pdf"))],
                )
            assert resp.status_code == 201, resp.text
            body = resp.json()
            assert body["kind"] == "imported"
            assert body["status"] == "signed"
            assert body["template_id"] is None
        finally:
            app.dependency_overrides.clear()

    def test_multi_file_happy_path(self) -> None:
        org_id, user_id, applicant_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        lease_id = uuid.uuid4()
        expected = _ok_lease_response(
            lease_id, applicant_id, org_id, user_id, num_attachments=3,
        )

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.import_signed_lease",
                new_callable=AsyncMock,
                return_value=expected,
            ):
                client = TestClient(app)
                resp = client.post(
                    "/signed-leases/import",
                    data={"applicant_id": str(applicant_id)},
                    files=[
                        ("files", ("lease.pdf", BytesIO(b"%PDF-1.4"), "application/pdf")),
                        ("files", ("addendum.pdf", BytesIO(b"%PDF-1.4"), "application/pdf")),
                        ("files", ("extra.pdf", BytesIO(b"%PDF-1.4"), "application/pdf")),
                    ],
                )
            assert resp.status_code == 201, resp.text
            body = resp.json()
            assert len(body["attachments"]) == 3
        finally:
            app.dependency_overrides.clear()

    def test_no_files_returns_422(self) -> None:
        org_id, user_id, applicant_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            # Sending empty applicant_id with no files — FastAPI will reject as
            # required field missing.
            resp = client.post(
                "/signed-leases/import",
                data={"applicant_id": str(applicant_id)},
                # no files= key
            )
            assert resp.status_code == 422
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Cross-tenant guards
# ---------------------------------------------------------------------------

class TestImportCrossTenantGuards:
    def test_cross_tenant_applicant_returns_404(self) -> None:
        org_id, user_id, applicant_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        from app.services.leases.signed_lease_service import ApplicantNotFoundError

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.import_signed_lease",
                new_callable=AsyncMock,
                side_effect=ApplicantNotFoundError("Applicant not found"),
            ):
                client = TestClient(app)
                resp = client.post(
                    "/signed-leases/import",
                    data={"applicant_id": str(applicant_id)},
                    files=[("files", ("x.pdf", BytesIO(b"%PDF"), "application/pdf"))],
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_cross_tenant_listing_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id, listing_id = uuid.uuid4(), uuid.uuid4()

        from app.services.leases.signed_lease_service import ListingNotFoundError

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.import_signed_lease",
                new_callable=AsyncMock,
                side_effect=ListingNotFoundError("Listing not found"),
            ):
                client = TestClient(app)
                resp = client.post(
                    "/signed-leases/import",
                    data={
                        "applicant_id": str(applicant_id),
                        "listing_id": str(listing_id),
                    },
                    files=[("files", ("x.pdf", BytesIO(b"%PDF"), "application/pdf"))],
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Error cases
# ---------------------------------------------------------------------------

class TestImportErrorCases:
    def test_disallowed_content_type_returns_415(self) -> None:
        org_id, user_id, applicant_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        from app.services.leases.signed_lease_service import AttachmentTypeRejectedError

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.import_signed_lease",
                new_callable=AsyncMock,
                side_effect=AttachmentTypeRejectedError(
                    "Unsupported file type for 'exploit.exe'.",
                ),
            ):
                client = TestClient(app)
                resp = client.post(
                    "/signed-leases/import",
                    data={"applicant_id": str(applicant_id)},
                    files=[("files", ("exploit.exe", BytesIO(b"MZ"), "application/octet-stream"))],
                )
            assert resp.status_code == 415
        finally:
            app.dependency_overrides.clear()

    def test_oversized_file_returns_413(self) -> None:
        org_id, user_id, applicant_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        from app.services.leases.signed_lease_service import AttachmentTooLargeError

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.import_signed_lease",
                new_callable=AsyncMock,
                side_effect=AttachmentTooLargeError("File exceeds 10MB limit"),
            ):
                client = TestClient(app)
                resp = client.post(
                    "/signed-leases/import",
                    data={"applicant_id": str(applicant_id)},
                    files=[("files", ("big.pdf", BytesIO(b"%PDF" * 1000), "application/pdf"))],
                )
            assert resp.status_code == 413
        finally:
            app.dependency_overrides.clear()

    def test_storage_not_configured_returns_503(self) -> None:
        org_id, user_id, applicant_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        from app.services.leases.signed_lease_service import StorageNotConfiguredError

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.import_signed_lease",
                new_callable=AsyncMock,
                side_effect=StorageNotConfiguredError("Object storage is not configured"),
            ):
                client = TestClient(app)
                resp = client.post(
                    "/signed-leases/import",
                    data={"applicant_id": str(applicant_id)},
                    files=[("files", ("lease.pdf", BytesIO(b"%PDF"), "application/pdf"))],
                )
            assert resp.status_code == 503
        finally:
            app.dependency_overrides.clear()

    def test_invalid_status_returns_422(self) -> None:
        org_id, user_id, applicant_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            client = TestClient(app)
            resp = client.post(
                "/signed-leases/import",
                data={
                    "applicant_id": str(applicant_id),
                    "status": "BADSTATUS",
                },
                files=[("files", ("lease.pdf", BytesIO(b"%PDF"), "application/pdf"))],
            )
            assert resp.status_code == 422
        finally:
            app.dependency_overrides.clear()
