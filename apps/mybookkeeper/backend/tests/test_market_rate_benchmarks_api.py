"""HTTP route tests for /market-rate-benchmarks and /utility-plans/rate-comparison.

The service is mocked — its behaviour is covered in
``test_market_rate_benchmark_service.py``. What these pin is the contract the
routes own: payload validation (in particular the exactly-one-shape rule, which
must surface as a readable 422 rather than an IntegrityError 500), status
codes, the permission dependency each route hangs off, and the route-ordering
hazard where ``/rate-comparison`` would be swallowed by ``/{plan_id}``.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.market_benchmark_constants import (
    BENCHMARK_STATUS_ABOVE,
    MATERIAL_GAP_PCT,
)
from app.core.permissions import current_org_member, require_write_access
from app.core.utility_plan_constants import (
    RATE_TYPE_FIXED,
    RENEWAL_STATUS_ACTIVE,
    SERVICE_TYPE_ELECTRICITY,
)
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.properties.market_rate_benchmark_response import (
    MarketRateBenchmarkResponse,
)
from app.schemas.properties.utility_plan_rate_comparison_response import (
    UtilityPlanRateComparisonResponse,
)
from app.schemas.properties.utility_plan_rate_comparison_row import (
    UtilityPlanRateComparisonRow,
)
from app.schemas.properties.utility_plan_summary import UtilityPlanSummary
from app.services.properties.market_rate_benchmark_service import (
    InvalidMarketRateBenchmarkError,
    MarketRateBenchmarkNotFoundError,
)

ORG_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
PROPERTY_ID = uuid.uuid4()
PLAN_ID = uuid.uuid4()

_SERVICE = "app.api.market_rate_benchmarks.market_rate_benchmark_service"
_PLAN_ROUTE_SERVICE = "app.api.utility_plans.market_rate_benchmark_service"

TODAY = _dt.date(2026, 8, 11)


def _ctx(role: OrgRole = OrgRole.OWNER) -> RequestContext:
    return RequestContext(organization_id=ORG_ID, user_id=USER_ID, org_role=role)


@pytest.fixture()
def client():
    app.dependency_overrides[current_org_member] = lambda: _ctx()
    app.dependency_overrides[require_write_access] = lambda: _ctx()
    yield TestClient(app)
    app.dependency_overrides.clear()


def _benchmark(**overrides) -> MarketRateBenchmarkResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    base = {
        "id": uuid.uuid4(),
        "service_type": SERVICE_TYPE_ELECTRICITY,
        "rate_cents_per_kwh": Decimal("11.1000"),
        "monthly_cents": None,
        "source": "Power to Choose, 77021",
        "observed_on": TODAY,
        "notes": None,
        "is_stale": False,
        "created_at": now,
        "updated_at": now,
    }
    base.update(overrides)
    return MarketRateBenchmarkResponse(**base)


def _summary() -> UtilityPlanSummary:
    now = _dt.datetime.now(_dt.timezone.utc)
    return UtilityPlanSummary(
        id=PLAN_ID,
        property_id=PROPERTY_ID,
        property_name="6732 Peerless St",
        service_type=SERVICE_TYPE_ELECTRICITY,
        provider_name="Reliant",
        plan_name=None,
        rate_type=RATE_TYPE_FIXED,
        avg_price_cents_per_kwh_at_1000=Decimal("15.0600"),
        term_end_date=_dt.date(2027, 2, 17),
        days_until_term_end=190,
        renewal_status=RENEWAL_STATUS_ACTIVE,
        is_current=True,
        created_at=now,
        updated_at=now,
    )


def _comparison() -> UtilityPlanRateComparisonResponse:
    return UtilityPlanRateComparisonResponse(
        material_gap_pct=MATERIAL_GAP_PCT,
        above_market=[
            UtilityPlanRateComparisonRow(
                plan=_summary(),
                status=BENCHMARK_STATUS_ABOVE,
                plan_figure=Decimal("15.0600"),
                benchmark_figure=Decimal("11.1000"),
                gap_pct=Decimal("35.7"),
                benchmark_is_stale=False,
            ),
        ],
        not_compared=[],
        total_above_market=1,
        has_stale_benchmark=False,
    )


class TestListBenchmarks:
    def test_returns_the_recorded_benchmarks(self, client: TestClient) -> None:
        with patch(f"{_SERVICE}.list_benchmarks", new=AsyncMock(return_value=[_benchmark()])):
            response = client.get("/market-rate-benchmarks")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["service_type"] == SERVICE_TYPE_ELECTRICITY
        # Decimal is serialized as a string so four-decimal precision survives.
        assert body[0]["rate_cents_per_kwh"] == "11.1000"

    def test_hangs_off_the_read_permission(self, client: TestClient) -> None:
        app.dependency_overrides[current_org_member] = lambda: _ctx(OrgRole.VIEWER)
        with patch(f"{_SERVICE}.list_benchmarks", new=AsyncMock(return_value=[])):
            assert client.get("/market-rate-benchmarks").status_code == 200


class TestUpsertBenchmark:
    def test_accepts_a_metered_rate(self, client: TestClient) -> None:
        mock = AsyncMock(return_value=_benchmark())
        with patch(f"{_SERVICE}.upsert_benchmark", new=mock):
            response = client.put(
                f"/market-rate-benchmarks/{SERVICE_TYPE_ELECTRICITY}",
                json={"rate_cents_per_kwh": "11.1000", "observed_on": TODAY.isoformat()},
            )

        assert response.status_code == 200
        assert mock.await_args.kwargs["rate_cents_per_kwh"] == Decimal("11.1000")
        assert mock.await_args.kwargs["monthly_cents"] is None

    def test_accepts_a_flat_monthly(self, client: TestClient) -> None:
        mock = AsyncMock(
            return_value=_benchmark(
                service_type="internet", rate_cents_per_kwh=None, monthly_cents=6000,
            ),
        )
        with patch(f"{_SERVICE}.upsert_benchmark", new=mock):
            response = client.put(
                "/market-rate-benchmarks/internet",
                json={"monthly_cents": 6000, "observed_on": TODAY.isoformat()},
            )

        assert response.status_code == 200
        assert mock.await_args.kwargs["monthly_cents"] == 6000

    def test_rejects_both_shapes_at_once(self, client: TestClient) -> None:
        """A row carrying both cannot say which comparison it participates in."""
        response = client.put(
            f"/market-rate-benchmarks/{SERVICE_TYPE_ELECTRICITY}",
            json={
                "rate_cents_per_kwh": "11.1000",
                "monthly_cents": 6000,
                "observed_on": TODAY.isoformat(),
            },
        )
        assert response.status_code == 422

    def test_rejects_neither_shape(self, client: TestClient) -> None:
        response = client.put(
            f"/market-rate-benchmarks/{SERVICE_TYPE_ELECTRICITY}",
            json={"observed_on": TODAY.isoformat()},
        )
        assert response.status_code == 422

    def test_rejects_a_non_positive_rate(self, client: TestClient) -> None:
        response = client.put(
            f"/market-rate-benchmarks/{SERVICE_TYPE_ELECTRICITY}",
            json={"rate_cents_per_kwh": "0", "observed_on": TODAY.isoformat()},
        )
        assert response.status_code == 422

    def test_rejects_a_future_observation(self, client: TestClient) -> None:
        """A future date is a typo, and it would never age into staleness."""
        next_week = _dt.date.today() + _dt.timedelta(days=7)
        response = client.put(
            f"/market-rate-benchmarks/{SERVICE_TYPE_ELECTRICITY}",
            json={"rate_cents_per_kwh": "11.1", "observed_on": next_week.isoformat()},
        )
        assert response.status_code == 422

    def test_accepts_a_client_whose_today_is_a_day_ahead(
        self, client: TestClient,
    ) -> None:
        """The browser sends *its* local date, which can lead the server's.

        Without a day of slack, a user east of the server is rejected for
        picking today on their own calendar — a 422 they cannot act on.
        """
        with patch(_SERVICE) as service:
            service.upsert_benchmark = AsyncMock(return_value=_benchmark())
            tomorrow = _dt.date.today() + _dt.timedelta(days=1)
            response = client.put(
                f"/market-rate-benchmarks/{SERVICE_TYPE_ELECTRICITY}",
                json={
                    "rate_cents_per_kwh": "11.1",
                    "observed_on": tomorrow.isoformat(),
                },
            )
        assert response.status_code == 200

    def test_rejects_unknown_fields(self, client: TestClient) -> None:
        response = client.put(
            f"/market-rate-benchmarks/{SERVICE_TYPE_ELECTRICITY}",
            json={
                "rate_cents_per_kwh": "11.1",
                "observed_on": TODAY.isoformat(),
                "wishful_thinking": True,
            },
        )
        assert response.status_code == 422

    def test_unknown_service_type_is_a_422_not_a_500(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.upsert_benchmark",
            new=AsyncMock(side_effect=InvalidMarketRateBenchmarkError("nope")),
        ):
            response = client.put(
                "/market-rate-benchmarks/sewage",
                json={"rate_cents_per_kwh": "11.1", "observed_on": TODAY.isoformat()},
            )
        assert response.status_code == 422

    def test_hangs_off_the_write_permission(self, client: TestClient) -> None:
        from fastapi import HTTPException

        def _deny():
            raise HTTPException(status_code=403, detail="Read-only")

        app.dependency_overrides[require_write_access] = _deny
        response = client.put(
            f"/market-rate-benchmarks/{SERVICE_TYPE_ELECTRICITY}",
            json={"rate_cents_per_kwh": "11.1", "observed_on": TODAY.isoformat()},
        )
        assert response.status_code == 403


class TestDeleteBenchmark:
    def test_returns_204_on_success(self, client: TestClient) -> None:
        with patch(f"{_SERVICE}.delete_benchmark", new=AsyncMock(return_value=None)):
            response = client.delete(
                f"/market-rate-benchmarks/{SERVICE_TYPE_ELECTRICITY}",
            )
        assert response.status_code == 204

    def test_returns_404_when_nothing_was_recorded(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.delete_benchmark",
            new=AsyncMock(side_effect=MarketRateBenchmarkNotFoundError("electricity")),
        ):
            response = client.delete(
                f"/market-rate-benchmarks/{SERVICE_TYPE_ELECTRICITY}",
            )
        assert response.status_code == 404


class TestRateComparisonRoute:
    def test_returns_the_comparison(self, client: TestClient) -> None:
        with patch(
            f"{_PLAN_ROUTE_SERVICE}.get_rate_comparison",
            new=AsyncMock(return_value=_comparison()),
        ):
            response = client.get("/utility-plans/rate-comparison")

        assert response.status_code == 200
        body = response.json()
        assert body["total_above_market"] == 1
        assert body["above_market"][0]["gap_pct"] == "35.7"
        assert body["material_gap_pct"] == MATERIAL_GAP_PCT

    def test_literal_path_is_not_swallowed_by_the_uuid_route(
        self, client: TestClient,
    ) -> None:
        """Declaring ``/{plan_id}`` first would turn this into a 422."""
        with patch(
            f"{_PLAN_ROUTE_SERVICE}.get_rate_comparison",
            new=AsyncMock(return_value=_comparison()),
        ) as mock:
            client.get("/utility-plans/rate-comparison")
        assert mock.await_count == 1

    def test_hangs_off_the_read_permission(self, client: TestClient) -> None:
        app.dependency_overrides[current_org_member] = lambda: _ctx(OrgRole.VIEWER)
        with patch(
            f"{_PLAN_ROUTE_SERVICE}.get_rate_comparison",
            new=AsyncMock(return_value=_comparison()),
        ):
            assert client.get("/utility-plans/rate-comparison").status_code == 200
