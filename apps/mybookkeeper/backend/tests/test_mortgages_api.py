"""Route-level tests for the mortgages API.

Service layer is mocked — the arithmetic lives in ``test_refi_math.py`` and
``test_refi_outlook.py``. What is being checked here is the routing contract:
cross-tenant access surfaces as 404, the literal ``/extract`` paths are not
swallowed by the UUID route, and a service-level rejection becomes a 422 rather
than a 500.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from io import BytesIO
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.mortgage_enums import RATE_TYPE_FIXED
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _response(mortgage_id: uuid.UUID, org_id: uuid.UUID, user_id: uuid.UUID):
    from app.schemas.mortgage.mortgage_response import MortgageResponse

    now = _dt.datetime.now(_dt.timezone.utc)
    return MortgageResponse(
        id=mortgage_id,
        user_id=user_id,
        organization_id=org_id,
        property_id=uuid.uuid4(),
        property_name="6734 Peerless",
        rate_type=RATE_TYPE_FIXED,
        created_at=now,
        updated_at=now,
    )


def _draft(document_id: uuid.UUID):
    from app.schemas.mortgage.mortgage_draft import MortgageDraft

    return MortgageDraft(source_document_id=document_id, confidence="high")


class TestCreateMortgage:
    def test_happy_path(self) -> None:
        org_id, user_id, mortgage_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.mortgages.mortgage_service.create_mortgage",
                return_value=_response(mortgage_id, org_id, user_id),
            ):
                response = TestClient(app).post(
                    "/mortgages",
                    json={"property_id": str(uuid.uuid4()), "rate_type": "fixed"},
                )
            assert response.status_code == 201
            assert response.json()["id"] == str(mortgage_id)
        finally:
            app.dependency_overrides.clear()

    def test_a_rejected_loan_is_a_422_not_a_500(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            from app.services.mortgage import mortgage_service

            with patch(
                "app.api.mortgages.mortgage_service.create_mortgage",
                side_effect=mortgage_service.InvalidMortgageError("nope"),
            ):
                response = TestClient(app).post(
                    "/mortgages",
                    json={"property_id": str(uuid.uuid4()), "rate_type": "fixed"},
                )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()

    def test_rate_type_is_required(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            response = TestClient(app).post(
                "/mortgages", json={"property_id": str(uuid.uuid4())},
            )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()


class TestGetMortgage:
    def test_another_tenant_s_loan_is_a_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            from app.services.mortgage import mortgage_service

            with patch(
                "app.api.mortgages.mortgage_service.get_mortgage",
                side_effect=mortgage_service.MortgageNotFoundError(),
            ):
                response = TestClient(app).get(f"/mortgages/{uuid.uuid4()}")
            assert response.status_code == 404
        finally:
            app.dependency_overrides.clear()


class TestUpdateMortgage:
    def test_an_empty_patch_reads_the_row_back(self) -> None:
        """No fields set means nothing to change — not a 422, and not a write."""
        org_id, user_id, mortgage_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.mortgages.mortgage_service.get_mortgage",
                return_value=_response(mortgage_id, org_id, user_id),
            ) as get_mortgage, patch(
                "app.api.mortgages.mortgage_service.update_mortgage",
            ) as update_mortgage:
                response = TestClient(app).patch(f"/mortgages/{mortgage_id}", json={})
            assert response.status_code == 200
            assert get_mortgage.called
            assert not update_mortgage.called
        finally:
            app.dependency_overrides.clear()

    def test_an_explicit_null_is_a_real_edit(self) -> None:
        """Clearing a value must not be confused with omitting the field."""
        org_id, user_id, mortgage_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.mortgages.mortgage_service.update_mortgage",
                return_value=_response(mortgage_id, org_id, user_id),
            ) as update_mortgage:
                response = TestClient(app).patch(
                    f"/mortgages/{mortgage_id}", json={"lender": None},
                )
            assert response.status_code == 200
            assert update_mortgage.call_args.kwargs["fields"] == {"lender": None}
        finally:
            app.dependency_overrides.clear()


class TestDeleteMortgage:
    def test_returns_204(self) -> None:
        org_id, user_id, mortgage_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.mortgages.mortgage_service.delete_mortgage",
                return_value=None,
            ):
                response = TestClient(app).delete(f"/mortgages/{mortgage_id}")
            assert response.status_code == 204
        finally:
            app.dependency_overrides.clear()


class TestExtractRoutes:
    def test_extract_is_not_swallowed_by_the_uuid_route(self) -> None:
        """``/mortgages/extract`` is a literal path, not a mortgage id."""
        org_id, user_id, document_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.mortgages.mortgage_statement_extraction_service"
                ".extract_mortgage_from_document",
                return_value=_draft(document_id),
            ):
                response = TestClient(app).post(
                    "/mortgages/extract", json={"document_id": str(document_id)},
                )
            assert response.status_code == 200
            assert response.json()["source_document_id"] == str(document_id)
        finally:
            app.dependency_overrides.clear()

    def test_an_unreadable_upload_is_a_422_not_a_413(self) -> None:
        """``UnreadableDocumentError`` is a ``ValueError``, so its handler has
        to come first or the upload-rejection mapping swallows it."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            from app.services.mortgage import mortgage_statement_extraction_service

            with patch(
                "app.api.mortgages.mortgage_statement_extraction_service"
                ".extract_mortgage_from_upload",
                side_effect=(
                    mortgage_statement_extraction_service.UnreadableDocumentError(
                        "not a statement",
                    )
                ),
            ):
                response = TestClient(app).post(
                    "/mortgages/extract-upload",
                    files={"file": ("s.pdf", BytesIO(b"x"), "application/pdf")},
                )
            assert response.status_code == 422
        finally:
            app.dependency_overrides.clear()
