"""Rent receipts are dated with the caller's local date, not the server's.

Production runs in UTC, so a US host sending a receipt in the evening used to
get tomorrow's date. Send and preview now require the client's local date,
validated to be within one day of the server's UTC date.
"""
from __future__ import annotations

import datetime
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.services.leases import receipt_send_service, receipt_service
from app.services.leases.receipt_pdf_service import ReceiptData
from app.services.leases.receipt_send_result import ReceiptSendResult
from tests.receipt_seed import CLIENT_TODAY, PERIOD_END, PERIOD_START, seed_receipt

_PERIOD = {"period_start": "2026-05-01", "period_end": "2026-05-31"}


def _utc_today() -> datetime.date:
    return datetime.datetime.now(datetime.timezone.utc).date()


@pytest.fixture
def pdf_inputs(monkeypatch: pytest.MonkeyPatch) -> list[ReceiptData]:
    recorded: list[ReceiptData] = []

    def _record(data: ReceiptData) -> bytes:
        recorded.append(data)
        return b"%PDF-1.4 fake"

    monkeypatch.setattr(receipt_send_service, "generate_receipt_pdf", _record)
    monkeypatch.setattr(receipt_service, "generate_receipt_pdf", _record)
    return recorded


@pytest.mark.usefixtures("receipt_sessions")
class TestServicesDateTheReceiptWithClientDate:
    @pytest.mark.asyncio
    async def test_send(
        self, db, test_org: Organization, test_user: User, pdf_inputs, receipt_storage, receipt_gmail_send,
    ) -> None:
        txn_id = await seed_receipt(db, org=test_org, user=test_user)

        await receipt_send_service.send_receipt(
            transaction_id=txn_id,
            organization_id=test_org.id,
            user_id=test_user.id,
            period_start=PERIOD_START,
            period_end=PERIOD_END,
            payment_method=None,
            today=CLIENT_TODAY,
        )

        assert [data.receipt_date for data in pdf_inputs] == [CLIENT_TODAY]

    @pytest.mark.asyncio
    async def test_preview(self, db, test_org: Organization, test_user: User, pdf_inputs) -> None:
        txn_id = await seed_receipt(db, org=test_org, user=test_user)

        await receipt_service.preview_receipt_pdf(
            transaction_id=txn_id,
            organization_id=test_org.id,
            user_id=test_user.id,
            period_start=PERIOD_START,
            period_end=PERIOD_END,
            payment_method=None,
            today=CLIENT_TODAY,
        )

        assert [data.receipt_date for data in pdf_inputs] == [CLIENT_TODAY]


@pytest.fixture
def client():
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    ctx = RequestContext(organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER)
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[require_write_access] = lambda: ctx
    yield TestClient(app)
    app.dependency_overrides.pop(current_org_member, None)
    app.dependency_overrides.pop(require_write_access, None)


def _send(client: TestClient, today: str | None):
    body = {**_PERIOD, **({"today": today} if today is not None else {})}
    return client.post(f"/rent-receipts/{uuid.uuid4()}/send", json=body)


def _preview(client: TestClient, today: str | None):
    params = {**_PERIOD, **({"today": today} if today is not None else {})}
    return client.get(f"/rent-receipts/preview/{uuid.uuid4()}", params=params)


_SEND = (_send, "app.services.leases.receipt_send_service.send_receipt",
         ReceiptSendResult(receipt_number="R-2026-0001", attachment_id=uuid.uuid4()))
_PREVIEW = (_preview, "app.services.leases.receipt_service.preview_receipt_pdf",
            (b"%PDF-1.4 fake", "receipt-preview.pdf"))


class TestRoutesRequireClientDate:
    @pytest.mark.parametrize(("call", "target", "result"), [_SEND, _PREVIEW], ids=["send", "preview"])
    @pytest.mark.parametrize("offset", [-1, 0, 1])
    def test_passes_client_date_to_service(self, client, call, target, result, offset: int) -> None:
        today = _utc_today() + datetime.timedelta(days=offset)
        with patch(target, new_callable=AsyncMock, return_value=result) as service:
            resp = call(client, today.isoformat())

        assert resp.status_code == 200
        assert service.await_args.kwargs["today"] == today

    @pytest.mark.parametrize(("call", "target", "result"), [_SEND, _PREVIEW], ids=["send", "preview"])
    @pytest.mark.parametrize("offset", [None, -2, 2, 400])
    def test_missing_or_far_off_date_is_422(self, client, call, target, result, offset: int | None) -> None:
        today = None if offset is None else (_utc_today() + datetime.timedelta(days=offset)).isoformat()
        with patch(target, new_callable=AsyncMock, return_value=result) as service:
            resp = call(client, today)

        assert resp.status_code == 422
        service.assert_not_awaited()
