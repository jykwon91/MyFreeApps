"""HTTP route tests for /rent-receipts endpoints.

Uses dependency_overrides on ``current_org_member`` / ``require_write_access``
and patches service calls — no real DB or Gmail connection required.

Covers:
- GET /rent-receipts/pending — enriched items, total, Gmail state, empty list.
- POST /rent-receipts/{transaction_id}/send — happy path, 404, 422 (not attributed),
  422 (teammate's tenant), 422 (no email), 422 (no integration), 503 (gmail_reauth_required), 502 (send error).
- POST /rent-receipts/{transaction_id}/dismiss — happy path, 404, 422 (already sent), 409 (mid-send).
- GET /rent-receipts/preview/{transaction_id} — happy path, 422s, 404.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
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
)
from app.services.leases import exceptions as exc
from app.services.leases.receipt_send_result import ReceiptSendResult


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _pending_receipt(transaction_id: uuid.UUID | None = None) -> PendingReceiptResponse:
    now = datetime.now(timezone.utc)
    return PendingReceiptResponse(
        id=uuid.uuid4(),
        transaction_id=transaction_id or uuid.uuid4(),
        applicant_id=uuid.uuid4(),
        signed_lease_id=uuid.uuid4(),
        period_start_date=date(2026, 5, 1),
        period_end_date=date(2026, 5, 31),
        status="pending",
        sent_at=None,
        sent_via_attachment_id=None,
        created_at=now,
        tenant_name="Maria Lopez",
        amount=Decimal("1450.00"),
        transaction_date=date(2026, 5, 3),
        payer_name="M LOPEZ",
        payment_method=None,
        vendor="Zelle",
        send_blocker=None,
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
    def test_returns_enriched_items_total_and_gmail_state(
        self, client, override_ctx, org_id, user_id,
    ) -> None:
        listing = PendingReceiptListResponse(
            items=[_pending_receipt()],
            total=3,
            pending_count=3,
            gmail_state="needs_send_permission",
        )
        with patch(
            "app.services.leases.receipt_service.get_pending_receipt_list",
            new_callable=AsyncMock,
            return_value=listing,
        ) as list_mock:
            resp = client.get("/rent-receipts/pending?limit=1&offset=2")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        assert body["pending_count"] == 3
        assert body["gmail_state"] == "needs_send_permission"
        item = body["items"][0]
        assert item["tenant_name"] == "Maria Lopez"
        assert item["amount"] == "1450.00"
        assert item["transaction_date"] == "2026-05-03"
        assert item["send_blocker"] is None
        assert "tenant_email" not in item
        list_mock.assert_awaited_once_with(
            organization_id=org_id, user_id=user_id, limit=1, offset=2,
        )

    def test_returns_empty_list(self, client, override_ctx) -> None:
        with patch(
            "app.services.leases.receipt_service.get_pending_receipt_list",
            new_callable=AsyncMock,
            return_value=PendingReceiptListResponse(
                items=[], total=0, pending_count=0, gmail_state="ready",
            ),
        ):
            resp = client.get("/rent-receipts/pending")

        assert resp.status_code == 200
        body = resp.json()
        assert body["pending_count"] == 0
        assert body["total"] == 0
        assert body["items"] == []

    def test_requires_auth(self, client) -> None:
        resp = client.get("/rent-receipts/pending")
        assert resp.status_code in (401, 422)


# ---------------------------------------------------------------------------
# POST /rent-receipts/{transaction_id}/send
# ---------------------------------------------------------------------------

_TODAY = datetime.now(timezone.utc).date().isoformat()

_SEND_BODY = {
    "period_start": "2026-05-01",
    "period_end": "2026-05-31",
    "payment_method": "check",
    "today": _TODAY,
}


class TestSendReceipt:
    def test_happy_path(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        attachment_id = uuid.uuid4()
        result = ReceiptSendResult(
            receipt_number="R-2026-0001",
            attachment_id=attachment_id,
        )
        with patch(
            "app.services.leases.receipt_send_service.send_receipt",
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
            "app.services.leases.receipt_send_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=LookupError("Transaction not found"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 404

    def test_not_attributed_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_send_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=exc.ReceiptTransactionNotAttributedError("not attributed"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 422

    def test_teammates_tenant_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_send_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=exc.ReceiptTenantOfOtherMemberError("teammate's tenant"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 422
        assert resp.json()["detail"] == "teammate's tenant"

    def test_no_email_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_send_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=exc.ReceiptMissingApplicantEmailError("no email"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 422

    def test_no_integration_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_send_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=exc.ReceiptMissingIntegrationError("no gmail"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 422

    def test_gmail_reauth_returns_503(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_send_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=exc.ReceiptGmailReauthError("token expired"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 503
        assert resp.json()["detail"] == "gmail_reauth_required"

    def test_gmail_send_error_returns_502(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_send_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=exc.ReceiptGmailSendError("send failed"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/send", json=_SEND_BODY)
        assert resp.status_code == 502

    @pytest.mark.parametrize(
        ("error", "status", "detail"),
        [
            (exc.ReceiptAlreadySentError("x"), 409, "receipt_already_sent"),
            (exc.ReceiptSendInProgressError("x"), 409, "receipt_send_in_progress"),
            (exc.ReceiptDismissedError("x"), 409, "receipt_dismissed"),
            (exc.ReceiptSendUnconfirmedError("x"), 502, "receipt_send_unconfirmed"),
            (exc.ReceiptSentNotRecordedError("x"), 500, "receipt_sent_not_recorded"),
        ],
    )
    def test_exactly_once_refusals_return_stable_codes(
        self, client, override_ctx, error, status, detail,
    ) -> None:
        with patch(
            "app.services.leases.receipt_send_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=error,
        ):
            resp = client.post(f"/rent-receipts/{uuid.uuid4()}/send", json=_SEND_BODY)
        assert resp.status_code == status
        assert resp.json()["detail"] == detail

    def test_send_from_another_gmail_names_the_account(self, client, override_ctx) -> None:
        with patch(
            "app.services.leases.receipt_send_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=exc.ReceiptSentFromOtherGmailError("old@gmail.com"),
        ):
            resp = client.post(f"/rent-receipts/{uuid.uuid4()}/send", json=_SEND_BODY)
        assert resp.status_code == 409
        assert resp.json()["detail"] == {
            "code": "receipt_sent_from_other_gmail",
            "sender_gmail_address": "old@gmail.com",
        }

    def test_no_lease_returns_422_with_message(self, client, override_ctx) -> None:
        with patch(
            "app.services.leases.receipt_send_service.send_receipt",
            new_callable=AsyncMock,
            side_effect=exc.ReceiptMissingLeaseError("This tenant has no signed lease"),
        ):
            resp = client.post(f"/rent-receipts/{uuid.uuid4()}/send", json=_SEND_BODY)
        assert resp.status_code == 422
        assert resp.json()["detail"] == "This tenant has no signed lease"

    def test_period_end_before_start_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        resp = client.post(
            f"/rent-receipts/{txn_id}/send",
            json={
                "period_start": "2026-05-31",
                "period_end": "2026-05-01",
                "payment_method": None,
                "today": _TODAY,
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

    def test_mid_send_returns_409_with_code(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.dismiss_pending_receipt",
            new_callable=AsyncMock,
            side_effect=exc.ReceiptSendInProgressError("x"),
        ):
            resp = client.post(f"/rent-receipts/{txn_id}/dismiss")
        assert resp.status_code == 409
        assert resp.json()["detail"] == "receipt_send_in_progress"


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
                    "today": _TODAY,
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
            side_effect=exc.ReceiptTransactionNotAttributedError("not attributed"),
        ):
            resp = client.get(
                f"/rent-receipts/preview/{txn_id}",
                params={
                    "period_start": "2026-05-01",
                    "period_end": "2026-05-31",
                    "today": _TODAY,
                },
            )
        assert resp.status_code == 422

    def test_teammates_tenant_returns_422(self, client, override_ctx) -> None:
        txn_id = uuid.uuid4()
        with patch(
            "app.services.leases.receipt_service.preview_receipt_pdf",
            new_callable=AsyncMock,
            side_effect=exc.ReceiptTenantOfOtherMemberError("teammate's tenant"),
        ):
            resp = client.get(
                f"/rent-receipts/preview/{txn_id}",
                params={"period_start": "2026-05-01", "period_end": "2026-05-31", "today": _TODAY},
            )
        assert resp.status_code == 422
        assert resp.json()["detail"] == "teammate's tenant"

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
                    "today": _TODAY,
                },
            )
        assert resp.status_code == 404

    def test_period_end_before_start_returns_422(self, client, override_ctx) -> None:
        with patch(
            "app.services.leases.receipt_service.preview_receipt_pdf",
            new_callable=AsyncMock,
        ) as preview:
            resp = client.get(
                f"/rent-receipts/preview/{uuid.uuid4()}",
                params={"period_start": "2026-05-31", "period_end": "2026-05-01", "today": _TODAY},
            )
        assert resp.status_code == 422
        preview.assert_not_awaited()
