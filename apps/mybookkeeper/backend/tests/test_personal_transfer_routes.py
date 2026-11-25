"""HTTP routes for marking personal transfers and the remembered senders.

Dependencies are overridden and the service is patched; the service has its
own tests against the database (``test_personal_transfer_service``).
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.transactions.personal_transfer_mark_result import PersonalTransferMarkResult
from app.schemas.transactions.personal_transfer_sender_read import PersonalTransferSenderRead
from app.schemas.transactions.personal_transfer_unmark_result import PersonalTransferUnmarkResult

_SERVICE = "app.api.personal_transfers.personal_transfer_service"


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture()
def ctx():
    context = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    app.dependency_overrides[current_org_member] = lambda: context
    app.dependency_overrides[require_write_access] = lambda: context
    yield context
    app.dependency_overrides.clear()


def test_mark_returns_the_sender_and_how_many_cleared(client, ctx) -> None:
    txn_id = uuid.uuid4()
    sender = PersonalTransferSenderRead(id=uuid.uuid4(), display_name="Dao Nguyen", payer_handle="")
    result = PersonalTransferMarkResult(transaction_id=txn_id, remembered_sender=sender, also_cleared=3)
    with patch(f"{_SERVICE}.mark", new=AsyncMock(return_value=result)) as mark:
        resp = client.put(f"/transactions/{txn_id}/personal-transfer")
    assert resp.status_code == 200
    body = resp.json()
    assert body["also_cleared"] == 3
    assert body["remembered_sender"]["display_name"] == "Dao Nguyen"
    mark.assert_awaited_once_with(
        transaction_id=txn_id, organization_id=ctx.organization_id, user_id=ctx.user_id,
    )


def test_mark_missing_transaction_is_404(client, ctx) -> None:
    with patch(f"{_SERVICE}.mark", new=AsyncMock(side_effect=ValueError("Transaction not found"))):
        resp = client.put(f"/transactions/{uuid.uuid4()}/personal-transfer")
    assert resp.status_code == 404


def test_undo_passes_forget_sender(client, ctx) -> None:
    txn_id = uuid.uuid4()
    result = PersonalTransferUnmarkResult(
        transaction_id=txn_id, status="unverified", back_in_review=True, forgotten_senders=1,
    )
    with patch(f"{_SERVICE}.unmark", new=AsyncMock(return_value=result)) as unmark:
        resp = client.post(f"/transactions/{txn_id}/personal-transfer/undo", json={"forget_sender": True})
    assert resp.status_code == 200
    assert resp.json() == {
        "transaction_id": str(txn_id), "status": "unverified", "back_in_review": True, "forgotten_senders": 1,
    }
    unmark.assert_awaited_once_with(
        transaction_id=txn_id, organization_id=ctx.organization_id, forget_sender=True,
    )


def test_undo_an_unmarked_transaction_is_422(client, ctx) -> None:
    error = ValueError("This transaction isn't marked as a personal transfer")
    with patch(f"{_SERVICE}.unmark", new=AsyncMock(side_effect=error)):
        resp = client.post(f"/transactions/{uuid.uuid4()}/personal-transfer/undo", json={})
    assert resp.status_code == 422


def test_list_senders(client, ctx) -> None:
    sender = PersonalTransferSenderRead(id=uuid.uuid4(), display_name="Dao Nguyen", payer_handle="dao@example.com")
    with patch(f"{_SERVICE}.list_senders", new=AsyncMock(return_value=[sender])):
        resp = client.get("/personal-transfer-senders")
    assert resp.status_code == 200
    assert resp.json() == [{"id": str(sender.id), "display_name": "Dao Nguyen", "payer_handle": "dao@example.com"}]


def test_forget_sender(client, ctx) -> None:
    with patch(f"{_SERVICE}.forget_sender", new=AsyncMock(return_value=True)):
        assert client.delete(f"/personal-transfer-senders/{uuid.uuid4()}").status_code == 204
    with patch(f"{_SERVICE}.forget_sender", new=AsyncMock(return_value=False)):
        assert client.delete(f"/personal-transfer-senders/{uuid.uuid4()}").status_code == 404
