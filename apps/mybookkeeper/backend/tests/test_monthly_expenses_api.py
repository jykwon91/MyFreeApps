"""Route-level contract for /monthly-expenses.

Services are mocked (their behaviour is in ``test_monthly_expense_service``).
Pinned: both routes are scoped to the caller's workspace and default to six
months of all money; an unknown range or scope is a 422; a heading is
required; the routes need a signed-in member.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.monthly_expenses.monthly_expense_category_detail_response import (
    MonthlyExpenseCategoryDetailResponse,
)
from app.schemas.monthly_expenses.monthly_expenses_response import MonthlyExpensesResponse
from app.services.monthly_expenses import monthly_expense_service

_SERVICE = "app.api.monthly_expenses.monthly_expense_service"
_CTX = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)


@pytest.fixture()
def client() -> Iterator[TestClient]:
    app.dependency_overrides[current_org_member] = lambda: _CTX
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_the_summary_defaults_to_six_months_of_everything(client: TestClient) -> None:
    service = AsyncMock(return_value=MonthlyExpensesResponse(
        range="6m", scope="all", currency="USD", bank_history_start=None, months=[], total_cents=0, average_cents=0,
        categories=[],
    ))
    with patch(f"{_SERVICE}.get_monthly_expenses", service):
        assert client.get("/monthly-expenses").status_code == 200
    kwargs = service.await_args.kwargs
    assert (kwargs["organization_id"], kwargs["range_key"], kwargs["scope"]) == (_CTX.organization_id, "6m", "all")


def test_a_heading_passes_its_label_range_and_scope(client: TestClient) -> None:
    service = AsyncMock(return_value=MonthlyExpenseCategoryDetailResponse(
        range="12m", scope="personal", label="Food & dining", currency="USD", total_cents=0, payees=[], transactions=[],
    ))
    with patch(f"{_SERVICE}.get_category_detail", service):
        res = client.get("/monthly-expenses/category", params={"category": "Food & dining", "range": "12m", "scope": "personal"})
    assert res.status_code == 200
    kwargs = service.await_args.kwargs
    assert (kwargs["organization_id"], kwargs["label"], kwargs["range_key"], kwargs["scope"]) == (
        _CTX.organization_id, "Food & dining", "12m", "personal",
    )


def test_bad_input_is_422(client: TestClient) -> None:
    assert client.get("/monthly-expenses/category").status_code == 422
    with patch(f"{_SERVICE}.get_monthly_expenses", AsyncMock(side_effect=monthly_expense_service.InvalidMonthlyExpenseRangeError("5y"))):
        assert client.get("/monthly-expenses", params={"range": "5y"}).status_code == 422
    with patch(f"{_SERVICE}.get_category_detail", AsyncMock(side_effect=monthly_expense_service.InvalidMonthlyExpenseScopeError("x"))):
        assert client.get("/monthly-expenses/category", params={"category": "Other", "scope": "x"}).status_code == 422


def test_signed_out_is_refused() -> None:
    anonymous = TestClient(app)
    assert anonymous.get("/monthly-expenses").status_code == 401
    assert anonymous.get("/monthly-expenses/category", params={"category": "Other"}).status_code == 401
