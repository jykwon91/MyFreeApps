"""Route-level contract for /budgets and /cash-flow.

Services are mocked (their behaviour is in ``test_budget_service``). Pinned:
every route is scoped to the caller's workspace; a missing month means this
month and a malformed one is a 422; a negative or absurd budget is a 422; a
foreign category is a 404 and an archived one a 409; an unknown range or scope
is a 422; the routes need a signed-in member.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.budget_constants import BUDGET_AMOUNT_MAX_CENTS
from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.budgets.budget_month_response import BudgetMonthResponse
from app.schemas.budgets.budget_totals_response import BudgetTotalsResponse
from app.schemas.budgets.spending_budget_response import SpendingBudgetResponse
from app.schemas.cash_flow.cash_flow_response import CashFlowResponse
from app.schemas.cash_flow.cash_flow_totals_response import CashFlowTotalsResponse
from app.services.budgets import budget_service
from app.services.cash_flow import cash_flow_service

_BUDGETS = "app.api.budgets.budget_service"
_CASH_FLOW = "app.api.cash_flow.cash_flow_service"
_CTX = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)


def _month_body(month: str) -> BudgetMonthResponse:
    return BudgetMonthResponse(
        month=month, currency="USD", lines=[], uncategorized_spent_cents=0,
        totals=BudgetTotalsResponse(
            budgeted_cents=None, spent_cents=0, remaining_cents=None, percent_used=None, is_over_budget=False,
        ),
    )


@pytest.fixture()
def client() -> Iterator[TestClient]:
    app.dependency_overrides[require_write_access] = lambda: _CTX
    app.dependency_overrides[current_org_member] = lambda: _CTX
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


class TestBudgetMonth:
    def test_reads_the_asked_month_for_the_callers_workspace(self, client: TestClient) -> None:
        service = AsyncMock(return_value=_month_body("2026-03"))
        with patch(f"{_BUDGETS}.get_month", service):
            res = client.get("/budgets", params={"month": "2026-03"})
        assert res.status_code == 200
        assert service.await_args.kwargs == {"organization_id": _CTX.organization_id, "month": _dt.date(2026, 3, 1)}

    def test_defaults_to_this_month(self, client: TestClient) -> None:
        service = AsyncMock(return_value=_month_body("2026-03"))
        with patch(f"{_BUDGETS}.get_month", service):
            client.get("/budgets")
        assert service.await_args.kwargs["month"] == _dt.date.today().replace(day=1)

    @pytest.mark.parametrize("month", ["2026-13", "march", "2026-3"])
    def test_a_malformed_month_is_422(self, client: TestClient, month: str) -> None:
        service = AsyncMock()
        with patch(f"{_BUDGETS}.get_month", service):
            res = client.get("/budgets", params={"month": month})
        assert res.status_code == 422
        service.assert_not_awaited()


class TestSetBudget:
    def test_saves_for_the_callers_workspace(self, client: TestClient) -> None:
        category_id = uuid.uuid4()
        service = AsyncMock(return_value=SpendingBudgetResponse(
            spending_category_id=category_id, effective_month="2026-03", amount_cents=400_00,
        ))
        with patch(f"{_BUDGETS}.set_budget", service):
            res = client.put(f"/budgets/{category_id}", json={"effective_month": "2026-03", "amount_cents": 400_00})
        assert res.status_code == 200
        assert res.json()["amount_cents"] == 400_00
        assert service.await_args.kwargs["organization_id"] == _CTX.organization_id
        assert service.await_args.kwargs["spending_category_id"] == category_id

    @pytest.mark.parametrize("body", [
        {"effective_month": "2026-03", "amount_cents": -1},
        {"effective_month": "2026-03", "amount_cents": BUDGET_AMOUNT_MAX_CENTS + 1},
        {"effective_month": "2026-3", "amount_cents": 1},
        {"amount_cents": 1},
    ])
    def test_a_bad_body_is_422(self, client: TestClient, body: dict[str, object]) -> None:
        service = AsyncMock()
        with patch(f"{_BUDGETS}.set_budget", service):
            res = client.put(f"/budgets/{uuid.uuid4()}", json=body)
        assert res.status_code == 422
        service.assert_not_awaited()

    def test_removing_a_budget_sends_null(self, client: TestClient) -> None:
        category_id = uuid.uuid4()
        service = AsyncMock(return_value=SpendingBudgetResponse(
            spending_category_id=category_id, effective_month="2026-03", amount_cents=None,
        ))
        with patch(f"{_BUDGETS}.set_budget", service):
            res = client.put(f"/budgets/{category_id}", json={"effective_month": "2026-03", "amount_cents": None})
        assert res.status_code == 200
        assert service.await_args.kwargs["payload"].amount_cents is None

    def test_a_foreign_category_is_404_and_an_archived_one_409(self, client: TestClient) -> None:
        body = {"effective_month": "2026-03", "amount_cents": 1}
        with patch(f"{_BUDGETS}.set_budget", AsyncMock(side_effect=budget_service.BudgetCategoryNotFoundError())):
            assert client.put(f"/budgets/{uuid.uuid4()}", json=body).status_code == 404
        with patch(f"{_BUDGETS}.set_budget", AsyncMock(side_effect=budget_service.BudgetCategoryArchivedError("x"))):
            assert client.put(f"/budgets/{uuid.uuid4()}", json=body).status_code == 409


class TestCashFlow:
    def test_passes_range_scope_and_account(self, client: TestClient) -> None:
        account_id = uuid.uuid4()
        service = AsyncMock(return_value=CashFlowResponse(
            range="12m", scope="personal", account_id=account_id, currency="USD", months=[],
            totals=CashFlowTotalsResponse(money_in_cents=0, money_out_cents=0, net_cents=0),
        ))
        with patch(f"{_CASH_FLOW}.get_cash_flow", service):
            res = client.get("/cash-flow", params={"range": "12m", "scope": "personal", "account_id": str(account_id)})
        assert res.status_code == 200
        kwargs = service.await_args.kwargs
        assert (kwargs["organization_id"], kwargs["range_key"], kwargs["scope"], kwargs["account_id"]) == (
            _CTX.organization_id, "12m", "personal", account_id,
        )

    def test_an_unknown_range_or_scope_is_422(self, client: TestClient) -> None:
        with patch(f"{_CASH_FLOW}.get_cash_flow", AsyncMock(side_effect=cash_flow_service.InvalidCashFlowRangeError("5y"))):
            assert client.get("/cash-flow", params={"range": "5y"}).status_code == 422
        with patch(f"{_CASH_FLOW}.get_cash_flow", AsyncMock(side_effect=cash_flow_service.InvalidCashFlowScopeError("x"))):
            assert client.get("/cash-flow", params={"scope": "x"}).status_code == 422


def test_signed_out_is_refused() -> None:
    anonymous = TestClient(app)
    assert anonymous.get("/budgets").status_code == 401
    assert anonymous.get("/cash-flow").status_code == 401
    assert anonymous.put(f"/budgets/{uuid.uuid4()}", json={"effective_month": "2026-03", "amount_cents": 1}).status_code == 401
