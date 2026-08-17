"""HTTP route test for /insurance-market/rate-watch.

The service is mocked — its behaviour is covered in
``test_insurance_market_watch_service.py``. What this pins is the contract the
route owns: the path, the permission dependency it hangs off, and that a feed
outage still returns 200 with the reason attached rather than an error the SPA
would render as an empty section.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.core.tdi_rate_filings_constants import REASON_FEED_DOWN
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.insurance.insurance_market_watch_response import (
    InsuranceMarketWatchResponse,
)
from app.schemas.insurance.insurance_policy_rate_outlook import (
    InsurancePolicyRateOutlook,
)
from app.schemas.insurance.insurance_rate_filing import InsuranceRateFiling

ORG_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
POLICY_ID = uuid.uuid4()

_SERVICE = "app.api.insurance_market.insurance_market_watch_service"
_PATH = "/insurance-market/rate-watch"


def _ctx(role: OrgRole = OrgRole.OWNER) -> RequestContext:
    return RequestContext(organization_id=ORG_ID, user_id=USER_ID, org_role=role)


@pytest.fixture()
def client():
    app.dependency_overrides[current_org_member] = lambda: _ctx()
    yield TestClient(app)
    app.dependency_overrides.clear()


def _response(**overrides) -> InsuranceMarketWatchResponse:
    filing = InsuranceRateFiling(
        serff_id="SFPT-134523456",
        company_name="SAFEPOINT INSURANCE COMPANY",
        product_name="TX DWO",
        percent_change=11.1,
        filed_date=_dt.date(2026, 5, 28),
        effective_date_renewal=_dt.date(2026, 9, 1),
        is_in_force=True,
    )
    base = {
        "outlooks": [
            InsurancePolicyRateOutlook(
                policy_id=POLICY_ID,
                policy_name="Dwelling DP-3",
                property_name="6738 Peerless St",
                carrier="SafePoint",
                expiration_date=_dt.date(2026, 9, 24),
                current_premium_cents=241_000,
                filings=[filing],
                projected_change_pct=11.1,
                projected_premium_cents=267_751,
            ),
        ],
        "market_filings": [filing],
        "has_any_increase": True,
    }
    base.update(overrides)
    return InsuranceMarketWatchResponse(**base)


def test_returns_the_rate_watch(client):
    with patch(f"{_SERVICE}.get_market_watch", AsyncMock(return_value=_response())):
        response = client.get(_PATH)

    assert response.status_code == 200
    body = response.json()
    assert body["has_any_increase"] is True
    assert body["outlooks"][0]["projected_premium_cents"] == 267_751
    assert body["market_filings"][0]["company_name"] == "SAFEPOINT INSURANCE COMPANY"
    assert body["feed_unavailable_reason"] is None


def test_scopes_the_read_to_the_caller_organization(client):
    mock = AsyncMock(return_value=_response())
    with patch(f"{_SERVICE}.get_market_watch", mock):
        client.get(_PATH)

    assert mock.await_args.kwargs["organization_id"] == ORG_ID
    assert mock.await_args.kwargs["user_id"] == USER_ID


def test_a_feed_outage_still_returns_the_policies_with_a_reason(client):
    degraded = _response(
        outlooks=[],
        market_filings=[],
        has_any_increase=False,
        feed_unavailable_reason=REASON_FEED_DOWN,
    )
    with patch(f"{_SERVICE}.get_market_watch", AsyncMock(return_value=degraded)):
        response = client.get(_PATH)

    assert response.status_code == 200
    assert response.json()["feed_unavailable_reason"] == REASON_FEED_DOWN


def test_a_non_member_is_refused():
    def _deny():
        raise HTTPException(status_code=403, detail="Not a member")

    app.dependency_overrides[current_org_member] = _deny
    try:
        assert TestClient(app).get(_PATH).status_code == 403
    finally:
        app.dependency_overrides.clear()
