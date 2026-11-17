"""Route-level tests for GET /analytics/rental-roi.

The service is mocked — the arithmetic lives in ``test_rental_roi_math.py`` and
the end-to-end service run in ``test_rental_roi_service.py``. What is checked
here is the routing contract: the target-return default and bounds, and that
the response shape reaches the client.
"""
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.analytics.rental_roi_response import RentalRoiResponse
from app.schemas.analytics.rental_roi_summary import RentalRoiSummary

SERVICE = "app.api.analytics.rental_roi_service.get_rental_roi"


def _ctx() -> RequestContext:
    return RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)


def _response(pct: Decimal) -> RentalRoiResponse:
    return RentalRoiResponse(
        window_start=date(2025, 11, 1),
        window_end=date(2026, 10, 31),
        target_return_pct=pct,
        has_transactions=False,
        unassigned_revenue_monthly_cents=0,
        summary=RentalRoiSummary(
            property_count=0,
            properties_with_target=0,
            total_break_even_monthly_cents=0,
            total_target_monthly_cents=0,
            total_actual_revenue_monthly_cents=0,
            total_gap_monthly_cents=0,
            gap_basis="break_even",
        ),
        properties=[],
    )


class TestRentalRoiRoute:
    def test_defaults_to_an_eight_percent_target(self) -> None:
        app.dependency_overrides[current_org_member] = _ctx
        try:
            with patch(SERVICE, new=AsyncMock(return_value=_response(Decimal("8")))) as service:
                response = TestClient(app).get("/analytics/rental-roi")
            assert response.status_code == 200
            assert service.await_args.kwargs["target_return_pct"] == Decimal("8")
            body = response.json()
            assert body["window_start"] == "2025-11-01"
            assert body["summary"]["gap_basis"] == "break_even"
        finally:
            app.dependency_overrides.clear()

    def test_passes_a_fractional_target_through(self) -> None:
        app.dependency_overrides[current_org_member] = _ctx
        try:
            with patch(SERVICE, new=AsyncMock(return_value=_response(Decimal("6.5")))) as service:
                response = TestClient(app).get("/analytics/rental-roi?target_return_pct=6.5")
            assert response.status_code == 200
            assert service.await_args.kwargs["target_return_pct"] == Decimal("6.5")
        finally:
            app.dependency_overrides.clear()

    def test_rejects_a_target_out_of_range(self) -> None:
        app.dependency_overrides[current_org_member] = _ctx
        try:
            with patch(SERVICE, new=AsyncMock()) as service:
                client = TestClient(app)
                assert client.get("/analytics/rental-roi?target_return_pct=-1").status_code == 422
                assert client.get("/analytics/rental-roi?target_return_pct=101").status_code == 422
                assert client.get("/analytics/rental-roi?target_return_pct=abc").status_code == 422
            assert not service.called
        finally:
            app.dependency_overrides.clear()

    def test_requires_an_org_member(self) -> None:
        response = TestClient(app).get("/analytics/rental-roi")
        assert response.status_code == 401
