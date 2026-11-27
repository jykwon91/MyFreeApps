"""HTTP routes for tagging a transaction's payee as a mortgage or a loan.

Dependencies are overridden and the service is patched; the service has its
own tests against the database (``test_loan_payee_service``).
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
from app.schemas.transactions.loan_payee_read import LoanPayeeRead
from app.services.transactions.loan_payee_service import NotALoanPaymentError, TransactionNotFoundError

_SERVICE = "app.api.loan_payees.loan_payee_service"
_READ = LoanPayeeRead(payee="Toyota Financial Services", kind="loan", can_tag=True)


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


def test_get_returns_the_payee_and_its_kind(client, ctx) -> None:
    txn_id = uuid.uuid4()
    with patch(f"{_SERVICE}.get_for_transaction", new=AsyncMock(return_value=_READ)) as get:
        resp = client.get(f"/transactions/{txn_id}/loan-payee")
    assert resp.status_code == 200
    assert resp.json() == {"payee": "Toyota Financial Services", "kind": "loan", "can_tag": True}
    get.assert_awaited_once_with(transaction_id=txn_id, organization_id=ctx.organization_id)


def test_put_tags_with_the_kind(client, ctx) -> None:
    txn_id = uuid.uuid4()
    with patch(f"{_SERVICE}.tag", new=AsyncMock(return_value=_READ)) as tag:
        resp = client.put(f"/transactions/{txn_id}/loan-payee", json={"kind": "loan"})
    assert resp.status_code == 200
    tag.assert_awaited_once_with(
        transaction_id=txn_id, organization_id=ctx.organization_id, user_id=ctx.user_id, kind="loan",
    )


def test_put_rejects_an_unknown_kind(client, ctx) -> None:
    resp = client.put(f"/transactions/{uuid.uuid4()}/loan-payee", json={"kind": "rent"})
    assert resp.status_code == 422


def test_errors_map_to_404_and_422(client, ctx) -> None:
    url = f"/transactions/{uuid.uuid4()}/loan-payee"
    with patch(f"{_SERVICE}.tag", new=AsyncMock(side_effect=TransactionNotFoundError("Transaction not found"))):
        assert client.put(url, json={"kind": "mortgage"}).status_code == 404
    with patch(f"{_SERVICE}.tag", new=AsyncMock(side_effect=NotALoanPaymentError("no"))):
        assert client.put(url, json={"kind": "mortgage"}).status_code == 422
    with patch(f"{_SERVICE}.untag", new=AsyncMock(side_effect=TransactionNotFoundError("Transaction not found"))):
        assert client.delete(url).status_code == 404
    with patch(f"{_SERVICE}.get_for_transaction", new=AsyncMock(side_effect=TransactionNotFoundError("x"))):
        assert client.get(url).status_code == 404


def test_delete_untags(client, ctx) -> None:
    txn_id = uuid.uuid4()
    untagged = LoanPayeeRead(payee="Toyota Financial Services", kind=None, can_tag=True)
    with patch(f"{_SERVICE}.untag", new=AsyncMock(return_value=untagged)) as untag:
        resp = client.delete(f"/transactions/{txn_id}/loan-payee")
    assert resp.status_code == 200
    assert resp.json()["kind"] is None
    untag.assert_awaited_once_with(transaction_id=txn_id, organization_id=ctx.organization_id)
