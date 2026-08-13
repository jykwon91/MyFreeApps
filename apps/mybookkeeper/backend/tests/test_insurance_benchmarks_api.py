"""HTTP route tests for /insurance-benchmarks and the premium comparison.

The service is mocked — its behaviour is covered in
``test_insurance_benchmark_service.py``. What these pin is the contract the
routes own: payload validation (both figures required, no future observation),
status codes, the permission dependency each route hangs off, and the
route-ordering hazard where ``/premium-comparison`` would be swallowed by
``/{policy_id}``.
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
from app.core.insurance_benchmark_constants import (
    BENCHMARK_STATUS_ABOVE,
    MATERIAL_GAP_PCT,
)
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.insurance.insurance_benchmark_response import (
    InsuranceBenchmarkResponse,
)
from app.schemas.insurance.insurance_policy_premium_comparison_response import (
    InsurancePolicyPremiumComparisonResponse,
)
from app.schemas.insurance.insurance_policy_premium_comparison_row import (
    InsurancePolicyPremiumComparisonRow,
)
from app.schemas.insurance.insurance_policy_summary import InsurancePolicySummary
from app.services.insurance.insurance_benchmark_service import (
    InsuranceBenchmarkNotFoundError,
)

ORG_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
LISTING_ID = uuid.uuid4()
POLICY_ID = uuid.uuid4()

_SERVICE = "app.api.insurance_benchmarks.insurance_benchmark_service"
_POLICY_ROUTE_SERVICE = "app.api.insurance_policies.insurance_benchmark_service"

TODAY = _dt.date(2026, 8, 13)

_VALID_PAYLOAD = {
    "annual_premium_cents": 120_000,
    "coverage_amount_cents": 40_000_000,
    "observed_on": TODAY.isoformat(),
}


def _ctx(role: OrgRole = OrgRole.OWNER) -> RequestContext:
    return RequestContext(organization_id=ORG_ID, user_id=USER_ID, org_role=role)


@pytest.fixture()
def client():
    app.dependency_overrides[current_org_member] = lambda: _ctx()
    app.dependency_overrides[require_write_access] = lambda: _ctx()
    yield TestClient(app)
    app.dependency_overrides.clear()


def _benchmark(**overrides) -> InsuranceBenchmarkResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    base = {
        "id": uuid.uuid4(),
        "annual_premium_cents": 120_000,
        "coverage_amount_cents": 40_000_000,
        "region_label": "Harris County, TX",
        "source": "TDI HelpInsure, HO-3, $2,500 deductible",
        "observed_on": TODAY,
        "notes": None,
        "created_at": now,
        "updated_at": now,
    }
    base.update(overrides)
    return InsuranceBenchmarkResponse(**base)


def _summary() -> InsurancePolicySummary:
    now = _dt.datetime.now(_dt.timezone.utc)
    return InsurancePolicySummary(
        id=POLICY_ID,
        listing_id=LISTING_ID,
        policy_name="Dwelling HO-3",
        carrier="State Farm",
        effective_date=_dt.date(2026, 3, 1),
        expiration_date=_dt.date(2027, 3, 1),
        coverage_amount_cents=40_000_000,
        premium_cents=200_000,
        premium_frequency="annual",
        deductible_cents=250_000,
        wind_hail_deductible_pct=Decimal("2.00"),
        created_at=now,
        updated_at=now,
    )


def _comparison() -> InsurancePolicyPremiumComparisonResponse:
    return InsurancePolicyPremiumComparisonResponse(
        material_gap_pct=MATERIAL_GAP_PCT,
        benchmark=_benchmark(),
        above_market=[
            InsurancePolicyPremiumComparisonRow(
                policy=_summary(),
                status=BENCHMARK_STATUS_ABOVE,
                policy_rate_cents_per_1000=Decimal("500.00"),
                benchmark_rate_cents_per_1000=Decimal("300.00"),
                gap_pct=Decimal("66.7"),
                benchmark_is_stale=False,
            ),
        ],
        not_compared=[],
        total_above_market=1,
        total_considered=1,
        has_stale_benchmark=False,
    )


class TestGetBenchmark:
    def test_returns_the_recorded_benchmark(self, client: TestClient) -> None:
        with patch(f"{_SERVICE}.get_benchmark", new=AsyncMock(return_value=_benchmark())):
            response = client.get("/insurance-benchmarks")

        assert response.status_code == 200
        body = response.json()
        assert body["annual_premium_cents"] == 120_000
        # Decimal is serialized as a string so precision survives the trip.
        assert body["rate_cents_per_1000_coverage"] == "300.00"
        assert body["is_stale"] is False

    def test_returns_null_rather_than_404_when_none_is_recorded(
        self, client: TestClient,
    ) -> None:
        """"None recorded yet" is every org's starting state, not a client
        error — and the form that records one renders off this response."""
        with patch(f"{_SERVICE}.get_benchmark", new=AsyncMock(return_value=None)):
            response = client.get("/insurance-benchmarks")

        assert response.status_code == 200
        assert response.json() is None

    def test_hangs_off_the_read_permission(self, client: TestClient) -> None:
        app.dependency_overrides[current_org_member] = lambda: _ctx(OrgRole.VIEWER)
        with patch(f"{_SERVICE}.get_benchmark", new=AsyncMock(return_value=None)):
            assert client.get("/insurance-benchmarks").status_code == 200


class TestUpsertBenchmark:
    def test_saves_both_figures(self, client: TestClient) -> None:
        mock = AsyncMock(return_value=_benchmark())
        with patch(f"{_SERVICE}.upsert_benchmark", new=mock):
            response = client.put("/insurance-benchmarks", json=_VALID_PAYLOAD)

        assert response.status_code == 200
        assert mock.await_args.kwargs["annual_premium_cents"] == 120_000
        assert mock.await_args.kwargs["coverage_amount_cents"] == 40_000_000

    def test_rejects_a_premium_with_no_coverage(self, client: TestClient) -> None:
        """It could never be normalised, so it would match nothing — and the
        operator would believe their policies were being checked."""
        response = client.put(
            "/insurance-benchmarks",
            json={"annual_premium_cents": 120_000, "observed_on": TODAY.isoformat()},
        )
        assert response.status_code == 422

    def test_rejects_coverage_with_no_premium(self, client: TestClient) -> None:
        response = client.put(
            "/insurance-benchmarks",
            json={"coverage_amount_cents": 40_000_000, "observed_on": TODAY.isoformat()},
        )
        assert response.status_code == 422

    def test_rejects_non_positive_figures(self, client: TestClient) -> None:
        assert (
            client.put(
                "/insurance-benchmarks", json={**_VALID_PAYLOAD, "annual_premium_cents": 0},
            ).status_code
            == 422
        )
        assert (
            client.put(
                "/insurance-benchmarks", json={**_VALID_PAYLOAD, "coverage_amount_cents": 0},
            ).status_code
            == 422
        )

    def test_rejects_a_figure_past_the_cents_dollars_sanity_cap(
        self, client: TestClient,
    ) -> None:
        """$10,000,000/yr of premium is a cents/dollars mix-up, not a quote."""
        response = client.put(
            "/insurance-benchmarks",
            json={**_VALID_PAYLOAD, "annual_premium_cents": 2_000_000_000},
        )
        assert response.status_code == 422

    def test_rejects_a_future_observation(self, client: TestClient) -> None:
        """A future date is a typo, and it would never age into staleness."""
        next_week = _dt.date.today() + _dt.timedelta(days=7)
        response = client.put(
            "/insurance-benchmarks",
            json={**_VALID_PAYLOAD, "observed_on": next_week.isoformat()},
        )
        assert response.status_code == 422

    def test_accepts_a_client_whose_today_is_a_day_ahead(
        self, client: TestClient,
    ) -> None:
        """The browser sends *its* local date, which can lead the server's.

        Without a day of slack, a user east of the server is rejected for
        picking today on their own calendar — a 422 they cannot act on.
        """
        tomorrow = _dt.date.today() + _dt.timedelta(days=1)
        with patch(f"{_SERVICE}.upsert_benchmark", new=AsyncMock(return_value=_benchmark())):
            response = client.put(
                "/insurance-benchmarks",
                json={**_VALID_PAYLOAD, "observed_on": tomorrow.isoformat()},
            )
        assert response.status_code == 200

    def test_rejects_unknown_fields(self, client: TestClient) -> None:
        response = client.put(
            "/insurance-benchmarks",
            json={**_VALID_PAYLOAD, "wishful_thinking": True},
        )
        assert response.status_code == 422

    def test_hangs_off_the_write_permission(self, client: TestClient) -> None:
        def _deny():
            raise HTTPException(status_code=403, detail="Read-only")

        app.dependency_overrides[require_write_access] = _deny
        response = client.put("/insurance-benchmarks", json=_VALID_PAYLOAD)
        assert response.status_code == 403


class TestDeleteBenchmark:
    def test_returns_204_on_success(self, client: TestClient) -> None:
        with patch(f"{_SERVICE}.delete_benchmark", new=AsyncMock(return_value=None)):
            assert client.delete("/insurance-benchmarks").status_code == 204

    def test_returns_404_when_nothing_was_recorded(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.delete_benchmark",
            new=AsyncMock(side_effect=InsuranceBenchmarkNotFoundError()),
        ):
            assert client.delete("/insurance-benchmarks").status_code == 404

    def test_hangs_off_the_write_permission(self, client: TestClient) -> None:
        def _deny():
            raise HTTPException(status_code=403, detail="Read-only")

        app.dependency_overrides[require_write_access] = _deny
        assert client.delete("/insurance-benchmarks").status_code == 403


class TestPremiumComparisonRoute:
    def test_returns_the_comparison(self, client: TestClient) -> None:
        with patch(
            f"{_POLICY_ROUTE_SERVICE}.get_premium_comparison",
            new=AsyncMock(return_value=_comparison()),
        ):
            response = client.get("/insurance-policies/premium-comparison")

        assert response.status_code == 200
        body = response.json()
        assert body["total_above_market"] == 1
        assert body["total_considered"] == 1
        assert body["above_market"][0]["gap_pct"] == "66.7"
        assert body["material_gap_pct"] == MATERIAL_GAP_PCT
        # The benchmark is echoed so the card can name what it compared to.
        assert body["benchmark"]["rate_cents_per_1000_coverage"] == "300.00"

    def test_literal_path_is_not_swallowed_by_the_uuid_route(
        self, client: TestClient,
    ) -> None:
        """Declaring ``/{policy_id}`` first would turn this into a 422."""
        with patch(
            f"{_POLICY_ROUTE_SERVICE}.get_premium_comparison",
            new=AsyncMock(return_value=_comparison()),
        ) as mock:
            client.get("/insurance-policies/premium-comparison")
        assert mock.await_count == 1

    def test_hangs_off_the_read_permission(self, client: TestClient) -> None:
        app.dependency_overrides[current_org_member] = lambda: _ctx(OrgRole.VIEWER)
        with patch(
            f"{_POLICY_ROUTE_SERVICE}.get_premium_comparison",
            new=AsyncMock(return_value=_comparison()),
        ):
            assert (
                client.get("/insurance-policies/premium-comparison").status_code == 200
            )
