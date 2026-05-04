"""HTTP route tests for /rent-receipts endpoints.

Uses dependency_overrides on ``current_org_member`` / ``require_write_access``
and patches service calls — no real DB or Gmail connection required.

Covers:
- GET /rent-receipts/pending — happy path and empty list.
- POST /rent-receipts/{transaction_id}/send — happy path, 404, 422 (not attributed),
  422 (no email), 422 (no integration), 503 (gmail_reauth_required), 502 (send error).
- POST /rent-receipts/{transaction_id}/dismiss — happy path, 404, 422 (already sent).
- GET /rent-receipts/preview/{transaction_id} — happy path and 422.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.leases.receipt_response import (
    PendingReceiptListResponse,
    PendingReceiptResponse,
    SendReceiptResponse,
)
from app.services.leases import receipt_service


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _pending_receipt(org_id: uuid.UUID, transaction_id: uuid.UUID | None = None) -> PendingReceiptResponse:
    now = datetime.now(timezone.utc)
    return PendingReceiptResponse(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        organization_id=org_id,
        transaction_id=transaction_id or uuid.uuid4(),
        applicant_id=uuid.uuid4(),
        signed_lease_id=uuid.uuid4(),
        period_start_date=date(2026, 5, 1),
        period_end_date=date(2026, 5, 31),
        status="pending",
        sent_at=None,
        sent_via_attachment_id=None,
        created_at=now,
        updated_at=now,
        deleted_at=None,
    )


@pytest.fixture()
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture()
def org_id():
    return uuid.uuid4()


@pytest.fixture()
def user_id():
    return uuid.uuid4()


@pytest.fixture()
def override_ctx(org_id, user_id):
    ctx = _ctx(org_id, user_id)
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[require_write_access] = lambda: ctx
    yield ctx
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /rent-receipts/pending
# ---------------------------------------------------------------------------

class TestListPendingReceipts:
    def test_returns_pending_list(self, client, override_ctx, org_id) -> None:
        receipt = _pending_receipt(org_id)
        with (
            patch(
                "app.services.leases.receipt_service.list_pending_receipts",
                new_callable=AsyncMock,
                return_value=[receipt],
            ),
            patch(
                "app.services.leases.receipt_service.count_pending_receipts",
                new_callable=AsyncMock,
                return_value=1,
            ),
        ):
            resp = client.get("/rent-receipts/pending")

        assert resp.status_code == 200
        body = resp.json()
        assert body["pending_count"] == 1
        assert len(body["items"]) == 1
        assert body["items"][0]["status"] == "pending"

    def test_returns_empty_list(self, client, override_ctx) -> None:
        with (
            patch(
                "app.services.leases.receipt_service.list_pending_receipts",
                new_callable=AsyncMock,
                return_value=[],
            ),
            patch(
                "app.services.leases.receipt_service.count_pending_receipts",
                new_callable=AsyncMock,
                return_value=0,
            ),
        ):
            resp = client.get("/rent-receipts/pending")

        assert resp.status_code == 200
        body = resp.json()
        assert body["pending_count"] == 0
        assert body["items"] == []

    def test_requires_auth(self, client) -> None:
        resp = client.get("/rent-receipts/pending")
        assert resp.status_code in (401, 422)


# ---------------------------------------------------------------------------
# POST /rent-receipts/{transaction_id}/send
# ---------------------------------------------------------------------------

_SEND_BODY = {
    "period_start": "2026-05-01",
    "period_end": "2026-05-31",
    "payment_method": "check",
}


class TestSendReceipt:
    def test_happy_path(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        attachment_id = uuid.uuid4()
        result = receipt_service.ReceiptSendResult(
            receipt_number="R-2026-0001",
            attachment_id=attachment_id,
        )
        with patch(
            "app.services.leases.receipt_service.send_receipt",
            new_callable=AsyncMock,
            return_value=result,
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)

        assert resp.status_code == 200
        body = resp.json()
        assert body["receipt_number"] == "R-2026-0001"
        assert body["attachment_id"] == str(attachment_id)

    def test_transaction_not_found_returns_404(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=LookupError("Transaction not found"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 404

    def test_not_attributed_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=receipt_service.ReceiptTransactionNotAttributedError("not attributed"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 422

    def test_no_email_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=receipt_service.ReceiptMissingApplicantEmailError("no email"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 422

    def test_no_integration_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=receipt_service.ReceiptMissingIntegrationError("no gmail"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 422

    def test_gmail_reauth_returns_503(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=receipt_service.ReceiptGmailReauthError("token expired"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 503
        assert resp.json()["detail"] == "gmail_reauth_required"

    def test_gmail_send_error_returns_502(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=receipt_service.ReceiptGmailSendError("send failed"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 502

    def test_period_end_before_start_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        resp = client.post(
            f"/rent-receipts/{txn_id}/send",
            json={
                "period_start": "2026-05-31",
                "period_end": "2026-05-01",
                "payment_method": None,
            },
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /rent-receipts/{transaction_id}/dismiss
# ---------------------------------------------------------------------------

class TestDismissReceipt:
    def test_happy_path_returns_204(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.dismiss_pending_receipt",
            new_callable=AsyncMock,
            return_value=None,
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/dismiss")
        assert resp.status_code == 204

    def test_not_found_returns_404(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.dismiss_pending_receipt",
            new_callable=AsyncMock,
            side_effect=LookupError("no pending receipt"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/dismiss")
        assert resp.status_code == 404

    def test_already_sent_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.dismiss_pending_receipt",
            new_callable=AsyncMock,
            side_effect=ValueError("Receipt is already sent"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/dismiss")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /rent-receipts/preview/{transaction_id}
# ---------------------------------------------------------------------------

class TestPreviewReceipt:
    def test_happy_path_returns_pdf(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        pdf_bytes = b"%PDF-1.4 fake"
        with patch(
            "app.services.leases.receipt_service.preview_receipt_pdf",
            new_callable=AsyncMock,
            return_value=(pdf_bytes, "receipt-preview.pdf"),
        ):
            resp = client.get(
                f"/rent-receipts/preview/{txn_id}",
                params={
                    "period_start": "2026-05-01",
                    "period_end": "2026-05-31",
                },
            )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content == pdf_bytes

    def test_not_attributed_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.preview_receipt_pdf",
            new_callable=AsyncMock,
            side_effect=receipt_service.ReceiptTransactionNotAttributedError("not attributed"),
        ):
            resp = client.get(
                f"/rent-receipts/preview/{txn_id}",
                params={
                    "period_start": "2026-05-01",
                    "period_end": "2026-05-31",
                },
            )
        assert resp.status_code == 422

    def test_not_found_returns_404(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.preview_receipt_pdf",
            new_callable=AsyncMock,
            side_effect=LookupError("not found"),
        ):
            resp = client.get(
                f"/rent-receipts/preview/{txn_id}",
                params={
                    "period_start": "2026-05-01",
                    "period_end": "2026-05-31",
                },
            )
        assert resp.status_code == 404
