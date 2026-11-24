"""Route-level contract for /holdings.

The service is mocked (its behaviour is in ``test_holding_service``). Pinned:
every route is the caller's own holdings in their workspace; quantity and
price travel as decimal strings; a zero or negative quantity, a negative
price, too many decimals, a bad ticker, an unknown type and a holding with
neither ticker nor name are 422s; a missing account or holding is a 404, a
wrong account type a 422 and a duplicate a 409; the routes need a signed-in
member.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.investments.holding_list_response import HoldingListResponse
from app.schemas.investments.holding_response import HoldingResponse
from app.schemas.investments.holding_totals_response import HoldingTotalsResponse
from app.services.investments.duplicate_holding_error import DuplicateHoldingError
from app.services.investments.holding_not_found_error import HoldingNotFoundError
from app.services.investments.invalid_holding_error import InvalidHoldingError

_SERVICE = "app.api.holdings.holding_service"
_CTX = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
_ACCOUNT_ID = uuid.uuid4()


def _holding() -> HoldingResponse:
    return HoldingResponse(
        id=uuid.uuid4(), financial_account_id=_ACCOUNT_ID, account_name="Brokerage", is_manual=True,
        security_id=uuid.uuid4(), ticker_symbol="VTI", name="Vanguard", security_type="etf",
        quantity=Decimal("10.5"), price=Decimal("250.1234"), price_as_of=None, is_price_stale=False,
        value_cents=262_630, cost_basis_cents=None, currency="USD",
    )


def _body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "financial_account_id": str(_ACCOUNT_ID), "ticker_symbol": "VTI", "name": "Vanguard",
        "security_type": "etf", "quantity": "10.5", "price": "250.1234",
    }
    body.update(overrides)
    return body


@pytest.fixture()
def client() -> Iterator[TestClient]:
    app.dependency_overrides[require_write_access] = lambda: _CTX
    app.dependency_overrides[current_org_member] = lambda: _CTX
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


class TestList:
    def test_lists_the_callers_holdings_narrowed_to_an_account(self, client: TestClient) -> None:
        listing = HoldingListResponse(
            financial_account_id=_ACCOUNT_ID, currency="USD", holdings=[_holding()],
            totals=HoldingTotalsResponse(value_cents=262_630), allocation=[],
        )
        service = AsyncMock(return_value=listing)
        with patch(f"{_SERVICE}.list_holdings", service):
            res = client.get("/holdings", params={"financial_account_id": str(_ACCOUNT_ID)})
        assert res.status_code == 200
        assert service.await_args.kwargs == {
            "user_id": _CTX.user_id, "organization_id": _CTX.organization_id,
            "financial_account_id": _ACCOUNT_ID,
        }
        line = res.json()["holdings"][0]
        assert (line["quantity"], line["price"]) == ("10.5", "250.1234")

    def test_an_unknown_account_is_a_404(self, client: TestClient) -> None:
        with patch(f"{_SERVICE}.list_holdings", AsyncMock(side_effect=HoldingNotFoundError("x"))):
            assert client.get("/holdings", params={"financial_account_id": str(uuid.uuid4())}).status_code == 404


class TestWrite:
    def test_create_is_a_201_for_the_caller(self, client: TestClient) -> None:
        service = AsyncMock(return_value=_holding())
        with patch(f"{_SERVICE}.create_holding", service):
            res = client.post("/holdings", json=_body(ticker_symbol=" vti "))
        assert res.status_code == 201
        kwargs = service.await_args.kwargs
        assert (kwargs["user_id"], kwargs["organization_id"]) == (_CTX.user_id, _CTX.organization_id)
        assert kwargs["payload"].ticker_symbol == "VTI"
        assert kwargs["payload"].quantity == Decimal("10.5")

    @pytest.mark.parametrize("overrides", [
        {"quantity": "0"},
        {"quantity": "-1"},
        {"quantity": "1.12345678901"},
        {"quantity": "1e13"},
        {"price": "-0.01"},
        {"price": "1.123456789"},
        {"ticker_symbol": "BAD TICKER"},
        {"security_type": "stock"},
        {"ticker_symbol": None, "name": "  "},
        {"cost_basis_cents": -1},
    ])
    def test_bad_input_is_a_422(self, client: TestClient, overrides: dict[str, Any]) -> None:
        service = AsyncMock()
        with patch(f"{_SERVICE}.create_holding", service):
            assert client.post("/holdings", json=_body(**overrides)).status_code == 422
        service.assert_not_awaited()

    @pytest.mark.parametrize(("error", "status"), [
        (HoldingNotFoundError("x"), 404),
        (InvalidHoldingError("not an investment account"), 422),
        (DuplicateHoldingError("already held"), 409),
    ])
    def test_service_refusals_map_to_statuses(
        self, client: TestClient, error: Exception, status: int,
    ) -> None:
        with patch(f"{_SERVICE}.create_holding", AsyncMock(side_effect=error)):
            assert client.post("/holdings", json=_body()).status_code == status
        with patch(f"{_SERVICE}.update_holding", AsyncMock(side_effect=error)):
            assert client.patch(f"/holdings/{uuid.uuid4()}", json={"price": "1"}).status_code == status

    def test_update_sends_only_what_was_given(self, client: TestClient) -> None:
        service = AsyncMock(return_value=_holding())
        holding_id = uuid.uuid4()
        with patch(f"{_SERVICE}.update_holding", service):
            assert client.patch(f"/holdings/{holding_id}", json={"cost_basis_cents": None}).status_code == 200
        kwargs = service.await_args.kwargs
        assert kwargs["holding_id"] == holding_id
        assert kwargs["payload"].model_dump(exclude_unset=True) == {"cost_basis_cents": None}

    def test_delete_is_a_204(self, client: TestClient) -> None:
        service = AsyncMock(return_value=None)
        holding_id = uuid.uuid4()
        with patch(f"{_SERVICE}.delete_holding", service):
            assert client.delete(f"/holdings/{holding_id}").status_code == 204
        assert service.await_args.kwargs == {
            "holding_id": holding_id, "user_id": _CTX.user_id, "organization_id": _CTX.organization_id,
        }
        with patch(f"{_SERVICE}.delete_holding", AsyncMock(side_effect=HoldingNotFoundError("x"))):
            assert client.delete(f"/holdings/{holding_id}").status_code == 404


def test_signed_out_is_refused() -> None:
    anonymous = TestClient(app)
    assert anonymous.get("/holdings").status_code == 401
    assert anonymous.post("/holdings", json=_body()).status_code == 401
    assert anonymous.patch(f"/holdings/{uuid.uuid4()}", json={}).status_code == 401
    assert anonymous.delete(f"/holdings/{uuid.uuid4()}").status_code == 401
