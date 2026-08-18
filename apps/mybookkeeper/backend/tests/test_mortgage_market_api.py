"""HTTP route test for /mortgage-market/rate-watch.

The service is mocked — its behaviour is covered in
``test_mortgage_market_service.py``. What this pins is the contract the route
owns: the path, the permission dependency it hangs off, that the read is scoped
to the caller's organization, and that a feed outage still returns 200 with the
reason attached rather than an error the SPA would render as an empty section.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.mortgage_enums import (
    RATE_TYPE_FIXED,
    TERM_MONTHS_30_YEAR,
    VERDICT_NOT_CHECKABLE,
    VERDICT_WORTH_PRICING,
)
from app.core.permissions import current_org_member
from app.core.pmms_rate_constants import REASON_FEED_UNAVAILABLE
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.mortgage.mortgage_rate_watch_response import (
    MortgageRateWatchResponse,
)
from app.schemas.mortgage.mortgage_refi_outlook import MortgageRefiOutlook

ORG_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
MORTGAGE_ID = uuid.uuid4()
PROPERTY_ID = uuid.uuid4()

_SERVICE = "app.api.mortgage_market.mortgage_rate_watch_service"
_PATH = "/mortgage-market/rate-watch"


def _ctx(role: OrgRole = OrgRole.OWNER) -> RequestContext:
    return RequestContext(organization_id=ORG_ID, user_id=USER_ID, org_role=role)


@pytest.fixture()
def client():
    app.dependency_overrides[current_org_member] = lambda: _ctx()
    yield TestClient(app)
    app.dependency_overrides.clear()


def _outlook(**overrides) -> MortgageRefiOutlook:
    base = {
        "mortgage_id": MORTGAGE_ID,
        "property_id": PROPERTY_ID,
        "property_name": "6734 Peerless",
        "lender": "TDECU",
        "rate_type": RATE_TYPE_FIXED,
        "current_rate_pct": Decimal("7.125"),
        "current_balance_cents": 33_613_735,
        "is_checkable": True,
        "unavailable_reason": None,
        "verdict": VERDICT_WORTH_PRICING,
        "survey_rate_pct": Decimal("6.67"),
        "survey_term_months": TERM_MONTHS_30_YEAR,
        "survey_observed_on": _dt.date(2026, 8, 13),
        "comparable_rate_low_pct": Decimal("7.07"),
        "comparable_rate_high_pct": Decimal("7.52"),
        "remaining_term_months": 343,
        "current_payment_cents": 229_738,
        "new_payment_low_cents": 224_500,
        "new_payment_high_cents": 234_900,
        "monthly_saving_low_cents": 0,
        "monthly_saving_high_cents": 5_238,
        "closing_cost_low_cents": 672_275,
        "closing_cost_high_cents": 1_680_687,
        "breakeven_low_months": 129,
        "breakeven_high_months": None,
    }
    base.update(overrides)
    return MortgageRefiOutlook(**base)


def _response(**overrides) -> MortgageRateWatchResponse:
    base = {
        "outlooks": [_outlook()],
        "survey_30_year_pct": Decimal("6.67"),
        "survey_15_year_pct": Decimal("5.96"),
        "survey_observed_on": _dt.date(2026, 8, 13),
        "checked_mortgage_count": 1,
    }
    base.update(overrides)
    return MortgageRateWatchResponse(**base)


def test_returns_the_rate_watch(client):
    with patch(f"{_SERVICE}.get_rate_watch", AsyncMock(return_value=_response())):
        response = client.get(_PATH)

    assert response.status_code == 200
    body = response.json()
    assert body["checked_mortgage_count"] == 1
    assert body["survey_30_year_pct"] == "6.67"
    assert body["survey_observed_on"] == "2026-08-13"
    assert body["feed_unavailable_reason"] is None

    outlook = body["outlooks"][0]
    assert outlook["mortgage_id"] == str(MORTGAGE_ID)
    assert outlook["verdict"] == VERDICT_WORTH_PRICING
    assert outlook["monthly_saving_high_cents"] == 5_238
    # A breakeven that never arrives has to survive as null, not become a
    # number the page would render as a wait the operator could sit out.
    assert outlook["breakeven_high_months"] is None


def test_scopes_the_read_to_the_caller_organization(client):
    mock = AsyncMock(return_value=_response())
    with patch(f"{_SERVICE}.get_rate_watch", mock):
        client.get(_PATH)

    assert mock.await_args.kwargs["organization_id"] == ORG_ID
    assert mock.await_args.kwargs["user_id"] == USER_ID


def test_a_feed_outage_still_returns_the_loans_with_a_reason(client):
    """Nothing was measured, so no benchmark is published — but every loan
    still lists, each carrying the explanation."""
    degraded = _response(
        outlooks=[
            _outlook(
                is_checkable=False,
                unavailable_reason=REASON_FEED_UNAVAILABLE,
                verdict=VERDICT_NOT_CHECKABLE,
                survey_rate_pct=None,
                survey_observed_on=None,
                monthly_saving_low_cents=None,
                monthly_saving_high_cents=None,
            ),
        ],
        survey_30_year_pct=None,
        survey_15_year_pct=None,
        survey_observed_on=None,
        checked_mortgage_count=0,
        feed_unavailable_reason=REASON_FEED_UNAVAILABLE,
    )
    with patch(f"{_SERVICE}.get_rate_watch", AsyncMock(return_value=degraded)):
        response = client.get(_PATH)

    assert response.status_code == 200
    body = response.json()
    assert body["feed_unavailable_reason"] == REASON_FEED_UNAVAILABLE
    assert body["checked_mortgage_count"] == 0
    assert len(body["outlooks"]) == 1
    assert body["outlooks"][0]["verdict"] == VERDICT_NOT_CHECKABLE


def test_a_non_member_is_refused():
    def _deny():
        raise HTTPException(status_code=403, detail="Not a member")

    app.dependency_overrides[current_org_member] = _deny
    try:
        assert TestClient(app).get(_PATH).status_code == 403
    finally:
        app.dependency_overrides.clear()
