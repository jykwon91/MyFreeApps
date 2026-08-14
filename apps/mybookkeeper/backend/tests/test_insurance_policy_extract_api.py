"""Route-level tests for reading a policy out of a document.

The extraction service is mocked — its behaviour is covered in
``test_insurance_policy_extraction.py``. What these tests pin is the contract
the routes own: payload validation, status codes, the per-user throttle in
front of a paid model call, and the route-ordering hazard where ``/extract``
would be swallowed by ``/{policy_id}`` if the declaration order were ever
changed.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.core.rate_limit import insurance_policy_extract_limiter
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.insurance.insurance_policy_draft import InsurancePolicyDraft
from app.services.insurance.insurance_policy_extraction_service import (
    DocumentNotFoundError,
    UnreadableDocumentError,
)

ORG_ID = uuid.uuid4()
USER_ID = uuid.uuid4()

_SERVICE = "app.api.insurance_policies.insurance_policy_service"
_EXTRACTION = "app.api.insurance_policies.insurance_policy_extraction_service"


def _ctx() -> RequestContext:
    return RequestContext(
        organization_id=ORG_ID, user_id=USER_ID, org_role=OrgRole.OWNER,
    )


@pytest.fixture()
def client():
    app.dependency_overrides[current_org_member] = lambda: _ctx()
    app.dependency_overrides[require_write_access] = lambda: _ctx()
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestExtract:
    """``POST /insurance-policies/extract`` — reads a document, saves nothing."""

    def test_a_draft_comes_back_without_anything_being_saved(
        self, client: TestClient,
    ) -> None:
        document_id = uuid.uuid4()
        draft = InsurancePolicyDraft(
            source_document_id=document_id,
            carrier="Texas Mutual",
            premium_cents=240_000,
            premium_frequency="annual",
            coverage_amount_cents=40_000_000,
            confidence="high",
        )
        with patch(
            f"{_EXTRACTION}.extract_policy_from_document",
            new_callable=AsyncMock,
            return_value=draft,
        ) as mock_extract:
            with patch(
                f"{_SERVICE}.create_policy", new_callable=AsyncMock,
            ) as mock_create:
                response = client.post(
                    "/insurance-policies/extract",
                    json={"document_id": str(document_id)},
                )

        assert response.status_code == 200
        assert response.json()["carrier"] == "Texas Mutual"
        assert mock_extract.await_args.kwargs["document_id"] == document_id
        mock_create.assert_not_called()

    def test_the_literal_path_is_not_swallowed_by_the_uuid_route(
        self, client: TestClient,
    ) -> None:
        """``/extract`` is declared before ``/{policy_id}``; this pins that order.

        Reversing them would send this request to ``get_policy``, which would
        reject "extract" as a malformed UUID — a 422 that looks like a payload
        problem and reads nothing like a routing bug.
        """
        with patch(f"{_SERVICE}.get_policy", new_callable=AsyncMock) as mock_get:
            with patch(
                f"{_EXTRACTION}.extract_policy_from_document",
                new_callable=AsyncMock,
                return_value=InsurancePolicyDraft(source_document_id=uuid.uuid4()),
            ):
                response = client.post(
                    "/insurance-policies/extract",
                    json={"document_id": str(uuid.uuid4())},
                )

        assert response.status_code == 200
        mock_get.assert_not_called()

    def test_a_document_we_do_not_own_returns_404(self, client: TestClient) -> None:
        """Same answer as a document that does not exist — no existence oracle."""
        with patch(
            f"{_EXTRACTION}.extract_policy_from_document",
            new_callable=AsyncMock,
            side_effect=DocumentNotFoundError("nope"),
        ):
            response = client.post(
                "/insurance-policies/extract",
                json={"document_id": str(uuid.uuid4())},
            )

        assert response.status_code == 404
        assert response.json()["detail"] == "Document not found"

    def test_an_unreadable_document_returns_422_with_the_reason(
        self, client: TestClient,
    ) -> None:
        with patch(
            f"{_EXTRACTION}.extract_policy_from_document",
            new_callable=AsyncMock,
            side_effect=UnreadableDocumentError("Policy terms can be read from a PDF."),
        ):
            response = client.post(
                "/insurance-policies/extract",
                json={"document_id": str(uuid.uuid4())},
            )

        assert response.status_code == 422
        assert "PDF" in response.json()["detail"]

    def test_a_missing_document_id_returns_422(self, client: TestClient) -> None:
        assert client.post("/insurance-policies/extract", json={}).status_code == 422

    def test_an_unknown_field_returns_422(self, client: TestClient) -> None:
        response = client.post(
            "/insurance-policies/extract",
            json={"document_id": str(uuid.uuid4()), "property_id": str(uuid.uuid4())},
        )
        assert response.status_code == 422

    def test_the_caller_is_throttled_before_the_model_is_called_again(
        self, client: TestClient,
    ) -> None:
        """Each call is a paid model request; the upload cap does not bound re-reads."""
        with patch.object(
            insurance_policy_extract_limiter,
            "check",
            side_effect=HTTPException(429, "slow down"),
        ):
            with patch(
                f"{_EXTRACTION}.extract_policy_from_document", new_callable=AsyncMock,
            ) as mock_extract:
                response = client.post(
                    "/insurance-policies/extract",
                    json={"document_id": str(uuid.uuid4())},
                )

        assert response.status_code == 429
        mock_extract.assert_not_called()

    def test_the_limit_is_keyed_per_user_not_globally(
        self, client: TestClient,
    ) -> None:
        """A shared key would let one operator's reading lock everyone else out."""
        with patch.object(insurance_policy_extract_limiter, "check") as mock_check:
            with patch(
                f"{_EXTRACTION}.extract_policy_from_document",
                new_callable=AsyncMock,
                return_value=InsurancePolicyDraft(source_document_id=uuid.uuid4()),
            ):
                client.post(
                    "/insurance-policies/extract",
                    json={"document_id": str(uuid.uuid4())},
                )

        assert str(USER_ID) in mock_check.call_args.args[0]

    def test_the_utility_readers_budget_is_not_spent_by_an_insurance_read(
        self, client: TestClient,
    ) -> None:
        """Separate buckets: a morning of EFL reading must not block a dec page."""
        from app.core.rate_limit import utility_plan_extract_limiter

        assert insurance_policy_extract_limiter is not utility_plan_extract_limiter


class TestExtractUpload:
    """``POST /insurance-policies/extract-upload`` — bytes in, draft out.

    The one-request form of ``/extract``, for a caller holding a file rather
    than a document id. A phone photographing a declarations page has nothing
    in the library to point at, and upload-then-read would give a mobile
    connection two chances to strand the operator halfway.
    """

    @staticmethod
    def _post(client: TestClient):
        return client.post(
            "/insurance-policies/extract-upload",
            files={"file": ("dec-page.pdf", b"%PDF-1.4 dec", "application/pdf")},
        )

    def test_a_draft_comes_back_without_a_policy_being_saved(
        self, client: TestClient,
    ) -> None:
        draft = InsurancePolicyDraft(
            source_document_id=uuid.uuid4(),
            carrier="Foremost",
            confidence="high",
        )
        with patch(
            f"{_EXTRACTION}.extract_policy_from_upload",
            new_callable=AsyncMock,
            return_value=draft,
        ) as mock_extract:
            with patch(
                f"{_SERVICE}.create_policy", new_callable=AsyncMock,
            ) as mock_create:
                response = self._post(client)

        assert response.status_code == 200
        assert response.json()["carrier"] == "Foremost"
        kwargs = mock_extract.await_args.kwargs
        assert kwargs["content"] == b"%PDF-1.4 dec"
        assert kwargs["filename"] == "dec-page.pdf"
        assert kwargs["content_type"] == "application/pdf"
        mock_create.assert_not_called()

    def test_the_literal_path_is_not_swallowed_by_the_uuid_route(
        self, client: TestClient,
    ) -> None:
        """Declared before ``/{policy_id}``; reversing them would 422 on the UUID."""
        with patch(f"{_SERVICE}.get_policy", new_callable=AsyncMock) as mock_get:
            with patch(
                f"{_EXTRACTION}.extract_policy_from_upload",
                new_callable=AsyncMock,
                return_value=InsurancePolicyDraft(source_document_id=uuid.uuid4()),
            ):
                response = self._post(client)

        assert response.status_code == 200
        mock_get.assert_not_called()

    @pytest.mark.parametrize(
        ("message", "expected"),
        [
            ("File exceeds 10MB limit", 413),
            ("Daily upload limit reached", 429),
            ("Unsupported file type", 415),
            ("File is empty", 422),
        ],
    )
    def test_a_refused_upload_keeps_its_own_status(
        self, client: TestClient, message: str, expected: int,
    ) -> None:
        """The store reports every rejection as a ``ValueError``; the caller
        still has to learn which one, because the fix differs — shrink the file,
        wait a day, or pick a different format."""
        with patch(
            f"{_EXTRACTION}.extract_policy_from_upload",
            new_callable=AsyncMock,
            side_effect=ValueError(message),
        ):
            response = self._post(client)

        assert response.status_code == expected
        assert response.json()["detail"] == message

    def test_a_file_that_stores_but_cannot_be_read_returns_422(
        self, client: TestClient,
    ) -> None:
        """``UnreadableDocumentError`` subclasses ``ValueError``, so it has to be
        caught ahead of the upload-rejection mapping. Catch it after and a file
        the model simply could not read would be reported as too large."""
        with patch(
            f"{_EXTRACTION}.extract_policy_from_upload",
            new_callable=AsyncMock,
            side_effect=UnreadableDocumentError("This document has no file content."),
        ):
            response = self._post(client)

        assert response.status_code == 422
        assert "no file content" in response.json()["detail"]

    def test_the_model_is_not_called_when_the_reader_is_rate_limited(
        self, client: TestClient,
    ) -> None:
        with patch.object(
            insurance_policy_extract_limiter,
            "check",
            side_effect=HTTPException(429, "slow down"),
        ):
            with patch(
                f"{_EXTRACTION}.extract_policy_from_upload", new_callable=AsyncMock,
            ) as mock_extract:
                response = self._post(client)

        assert response.status_code == 429
        mock_extract.assert_not_called()

    def test_a_request_with_no_file_returns_422(self, client: TestClient) -> None:
        assert client.post("/insurance-policies/extract-upload").status_code == 422
