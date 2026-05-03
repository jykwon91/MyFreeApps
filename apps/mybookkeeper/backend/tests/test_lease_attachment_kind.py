"""Tests for the lease attachment kind heuristic and the PATCH kind endpoint.

Coverage:
  - infer_kind_from_filename / infer_kinds_for_files: one test per heuristic
    branch + the fallback case.
  - PATCH /signed-leases/{lease_id}/attachments/{attachment_id}: happy path,
    cross-tenant 404, invalid kind 422, composite-filter IDOR guard.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.services.leases.signed_lease_service import (
    infer_kind_from_filename,
    infer_kinds_for_files,
)


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _attachment_response(kind: str = "signed_lease") -> dict:
    """Build a minimal SignedLeaseAttachmentResponse payload."""
    from app.schemas.leases.signed_lease_attachment_response import (
        SignedLeaseAttachmentResponse,
    )

    return SignedLeaseAttachmentResponse(
        id=uuid.uuid4(),
        lease_id=uuid.uuid4(),
        filename="lease.pdf",
        storage_key="signed-leases/x/y",
        content_type="application/pdf",
        size_bytes=1024,
        kind=kind,
        uploaded_by_user_id=uuid.uuid4(),
        uploaded_at=_dt.datetime.now(_dt.timezone.utc),
        presigned_url=None,
    ).model_dump(mode="json")


# ---------------------------------------------------------------------------
# infer_kind_from_filename — unit tests (one per heuristic branch)
# ---------------------------------------------------------------------------

class TestInferKindFromFilename:
    def test_move_in_inspection_hyphen(self) -> None:
        assert infer_kind_from_filename("Move-In Inspection.pdf") == "move_in_inspection"

    def test_move_in_inspection_space(self) -> None:
        assert infer_kind_from_filename("move in inspection report.pdf") == "move_in_inspection"

    def test_move_out_inspection_hyphen(self) -> None:
        assert infer_kind_from_filename("Move-Out Inspection.pdf") == "move_out_inspection"

    def test_move_out_inspection_space(self) -> None:
        assert infer_kind_from_filename("move out inspection 2026.pdf") == "move_out_inspection"

    def test_lease_agreement(self) -> None:
        assert infer_kind_from_filename("Lease Agreement.pdf") == "signed_lease"

    def test_master_lease(self) -> None:
        assert infer_kind_from_filename("master lease - unit 3.pdf") == "signed_lease"

    def test_rental_agreement(self) -> None:
        assert infer_kind_from_filename("Rental Agreement Signed.pdf") == "signed_lease"

    def test_generic_inspection(self) -> None:
        assert infer_kind_from_filename("Property Inspection.pdf") == "move_in_inspection"

    def test_insurance(self) -> None:
        assert infer_kind_from_filename("Tenant Insurance.pdf") == "insurance_proof"

    def test_unknown_filename_default(self) -> None:
        assert infer_kind_from_filename("House Rules.pdf") == "signed_addendum"


class TestInferKindsForFiles:
    def test_named_files_infer_correctly(self) -> None:
        filenames = [
            "Lease Agreement.pdf",
            "House Rules.pdf",
            "Pet Disclosure.pdf",
        ]
        kinds = infer_kinds_for_files(filenames)
        assert kinds == ["signed_lease", "signed_addendum", "signed_addendum"]

    def test_fallback_promotes_first_when_no_signed_lease(self) -> None:
        filenames = ["House Rules.pdf", "Pet Disclosure.pdf", "Addendum.pdf"]
        kinds = infer_kinds_for_files(filenames)
        assert kinds[0] == "signed_lease"
        assert kinds[1] == "signed_addendum"
        assert kinds[2] == "signed_addendum"

    def test_empty_list_returns_empty(self) -> None:
        assert infer_kinds_for_files([]) == []

    def test_inspection_files_detected(self) -> None:
        filenames = [
            "Move-In Inspection.pdf",
            "Move-Out Inspection.pdf",
        ]
        kinds = infer_kinds_for_files(filenames)
        # Neither matches signed_lease → first is promoted.
        assert kinds[0] == "signed_lease"
        assert kinds[1] == "move_out_inspection"

    def test_existing_signed_lease_prevents_fallback_promotion(self) -> None:
        filenames = ["Lease Agreement.pdf", "House Rules.pdf"]
        kinds = infer_kinds_for_files(filenames)
        assert kinds == ["signed_lease", "signed_addendum"]


# ---------------------------------------------------------------------------
# PATCH /signed-leases/{lease_id}/attachments/{attachment_id}
# ---------------------------------------------------------------------------

class TestUpdateAttachmentKind:
    def test_happy_path_returns_200(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        lease_id, attachment_id = uuid.uuid4(), uuid.uuid4()

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.update_attachment_kind",
                return_value=_attachment_response("signed_addendum"),
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/signed-leases/{lease_id}/attachments/{attachment_id}",
                    json={"kind": "signed_addendum"},
                )
            assert resp.status_code == 200, resp.text
            assert resp.json()["kind"] == "signed_addendum"
        finally:
            app.dependency_overrides.clear()

    def test_cross_tenant_returns_404(self) -> None:
        """User A cannot patch User B's attachment."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        lease_id, attachment_id = uuid.uuid4(), uuid.uuid4()

        from app.services.leases.signed_lease_service import SignedLeaseNotFoundError

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.update_attachment_kind",
                side_effect=SignedLeaseNotFoundError("not found"),
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/signed-leases/{lease_id}/attachments/{attachment_id}",
                    json={"kind": "signed_addendum"},
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    def test_invalid_kind_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        lease_id, attachment_id = uuid.uuid4(), uuid.uuid4()

        from app.services.leases.signed_lease_service import InvalidAttachmentKindError

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.update_attachment_kind",
                side_effect=InvalidAttachmentKindError("bad kind"),
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/signed-leases/{lease_id}/attachments/{attachment_id}",
                    json={"kind": "not_a_real_kind"},
                )
            assert resp.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_composite_filter_foreign_attachment_returns_404(self) -> None:
        """Pairing a valid own lease_id with a foreign attachment_id must 404."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        lease_id, attachment_id = uuid.uuid4(), uuid.uuid4()

        from app.services.leases.signed_lease_service import AttachmentNotFoundError

        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.signed_leases.signed_lease_service.update_attachment_kind",
                side_effect=AttachmentNotFoundError("foreign attachment"),
            ):
                client = TestClient(app)
                resp = client.patch(
                    f"/signed-leases/{lease_id}/attachments/{attachment_id}",
                    json={"kind": "signed_addendum"},
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()
