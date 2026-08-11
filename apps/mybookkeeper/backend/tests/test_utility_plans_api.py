"""HTTP route tests for /utility-plans.

The service is mocked — its behaviour is covered in
``test_utility_plan_service.py``. What these tests pin is the contract the
routes own: payload validation, status codes, the permission dependency each
route hangs off, and the route-ordering hazard where ``/renewal-alerts`` would
be swallowed by ``/{plan_id}`` if the declaration order were ever changed.
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
from app.core.permissions import current_org_member, require_write_access
from app.core.rate_limit import utility_plan_extract_limiter
from app.core.utility_plan_constants import (
    EXPIRING_SOON_DAYS,
    RATE_TYPE_FIXED,
    RENEWAL_STATUS_EXPIRED,
    SERVICE_TYPE_ELECTRICITY,
)
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.properties.utility_offer_search_response import (
    UtilityOfferSearchResponse,
)
from app.schemas.properties.utility_plan_draft import UtilityPlanDraft
from app.schemas.properties.utility_plan_list_response import UtilityPlanListResponse
from app.schemas.properties.utility_plan_renewal_alert_response import (
    UtilityPlanRenewalAlertResponse,
)
from app.schemas.properties.utility_plan_response import UtilityPlanResponse
from app.schemas.properties.utility_plan_summary import UtilityPlanSummary
from app.services.properties.utility_plan_extraction_service import (
    DocumentNotFoundError,
    UnreadableDocumentError,
)
from app.services.properties.utility_plan_service import (
    InvalidUtilityPlanError,
    UtilityPlanNotFoundError,
)

ORG_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
PROPERTY_ID = uuid.uuid4()
PLAN_ID = uuid.uuid4()

_SERVICE = "app.api.utility_plans.utility_plan_service"
_EXTRACTION = "app.api.utility_plans.utility_plan_extraction_service"
_OFFERS = "app.api.utility_plans.utility_offer_service"


def _ctx(role: OrgRole = OrgRole.OWNER) -> RequestContext:
    return RequestContext(organization_id=ORG_ID, user_id=USER_ID, org_role=role)


@pytest.fixture()
def client():
    """TestClient with both permission dependencies satisfied as an owner."""
    app.dependency_overrides[current_org_member] = lambda: _ctx()
    app.dependency_overrides[require_write_access] = lambda: _ctx()
    yield TestClient(app)
    app.dependency_overrides.clear()


def _detail(**overrides) -> UtilityPlanResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    fields = {
        "id": PLAN_ID,
        "user_id": USER_ID,
        "organization_id": ORG_ID,
        "property_id": PROPERTY_ID,
        "property_name": "6732 Peerless St",
        "service_type": SERVICE_TYPE_ELECTRICITY,
        "provider_name": "Constellation",
        "rate_type": RATE_TYPE_FIXED,
        "has_bill_credit": False,
        "renewal_status": RENEWAL_STATUS_EXPIRED,
        "is_current": True,
        "created_at": now,
        "updated_at": now,
    }
    fields.update(overrides)
    return UtilityPlanResponse(**fields)


def _summary(**overrides) -> UtilityPlanSummary:
    now = _dt.datetime.now(_dt.timezone.utc)
    fields = {
        "id": PLAN_ID,
        "property_id": PROPERTY_ID,
        "property_name": "6732 Peerless St",
        "service_type": SERVICE_TYPE_ELECTRICITY,
        "provider_name": "Constellation",
        "rate_type": RATE_TYPE_FIXED,
        "term_end_date": _dt.date(2026, 1, 27),
        "days_until_term_end": -192,
        "renewal_status": RENEWAL_STATUS_EXPIRED,
        "is_current": True,
        "created_at": now,
        "updated_at": now,
    }
    fields.update(overrides)
    return UtilityPlanSummary(**fields)


class TestCreate:
    def test_valid_payload_returns_201(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.create_plan", new_callable=AsyncMock, return_value=_detail(),
        ) as mock_create:
            response = client.post(
                "/utility-plans",
                json={
                    "property_id": str(PROPERTY_ID),
                    "service_type": "electricity",
                    "provider_name": "Constellation",
                    "rate_type": "fixed",
                    "energy_charge_cents_per_kwh": "11.6000",
                    "tdu_charge_cents_per_kwh": "5.3509",
                    "service_start_date": "2025-01-27",
                    "term_end_date": "2026-01-27",
                },
            )

        assert response.status_code == 201
        fields = mock_create.await_args.kwargs["fields"]
        # Sub-cent precision must survive the JSON boundary — a TDU charge
        # rounded to 5.35 would quietly misprice every comparison.
        assert fields["tdu_charge_cents_per_kwh"] == Decimal("5.3509")

    def test_unknown_service_type_returns_422(self, client: TestClient) -> None:
        response = client.post(
            "/utility-plans",
            json={
                "property_id": str(PROPERTY_ID),
                "service_type": "teleportation",
                "provider_name": "Constellation",
                "rate_type": "fixed",
            },
        )
        assert response.status_code == 422

    def test_term_end_before_start_returns_422(self, client: TestClient) -> None:
        response = client.post(
            "/utility-plans",
            json={
                "property_id": str(PROPERTY_ID),
                "service_type": "electricity",
                "provider_name": "Constellation",
                "rate_type": "fixed",
                "service_start_date": "2026-01-27",
                "term_end_date": "2025-01-27",
            },
        )
        assert response.status_code == 422

    def test_bill_credit_without_threshold_returns_422(
        self, client: TestClient,
    ) -> None:
        response = client.post(
            "/utility-plans",
            json={
                "property_id": str(PROPERTY_ID),
                "service_type": "electricity",
                "provider_name": "Constellation",
                "rate_type": "fixed",
                "has_bill_credit": True,
                "bill_credit_amount_cents": 10000,
            },
        )
        assert response.status_code == 422

    def test_internet_plan_round_trips_its_own_fields(
        self, client: TestClient,
    ) -> None:
        """An internet plan prices none of the kWh columns and must still land."""
        with patch(
            f"{_SERVICE}.create_plan", new_callable=AsyncMock, return_value=_detail(),
        ) as mock_create:
            response = client.post(
                "/utility-plans",
                json={
                    "property_id": str(PROPERTY_ID),
                    "service_type": "internet",
                    "provider_name": "AT&T Fiber",
                    "rate_type": "fixed",
                    "monthly_base_charge_cents": 5500,
                    "post_promo_monthly_cents": 9500,
                    "equipment_fee_monthly_cents": 1000,
                    "download_mbps": 1000,
                    "upload_mbps": 1000,
                    "data_cap_gb": 1200,
                    "service_start_date": "2026-02-17",
                    "term_end_date": "2027-02-17",
                },
            )

        assert response.status_code == 201
        fields = mock_create.await_args.kwargs["fields"]
        assert fields["post_promo_monthly_cents"] == 9500
        assert fields["equipment_fee_monthly_cents"] == 1000
        assert fields["download_mbps"] == 1000
        assert fields["data_cap_gb"] == 1200

    def test_post_promo_price_without_a_term_end_returns_422(
        self, client: TestClient,
    ) -> None:
        """A price step with no date it lands on cannot be rendered or alerted on."""
        response = client.post(
            "/utility-plans",
            json={
                "property_id": str(PROPERTY_ID),
                "service_type": "internet",
                "provider_name": "AT&T Fiber",
                "rate_type": "fixed",
                "post_promo_monthly_cents": 9500,
            },
        )
        assert response.status_code == 422
        assert "term_end_date" in response.text

    @pytest.mark.parametrize("field", ["download_mbps", "upload_mbps", "data_cap_gb"])
    def test_zero_speed_or_cap_returns_422(
        self, client: TestClient, field: str,
    ) -> None:
        """Zero would be indistinguishable from "not recorded", which is NULL."""
        response = client.post(
            "/utility-plans",
            json={
                "property_id": str(PROPERTY_ID),
                "service_type": "internet",
                "provider_name": "AT&T Fiber",
                "rate_type": "fixed",
                field: 0,
            },
        )
        assert response.status_code == 422

    def test_source_document_id_is_accepted(self, client: TestClient) -> None:
        document_id = uuid.uuid4()
        with patch(
            f"{_SERVICE}.create_plan", new_callable=AsyncMock, return_value=_detail(),
        ) as mock_create:
            response = client.post(
                "/utility-plans",
                json={
                    "property_id": str(PROPERTY_ID),
                    "service_type": "electricity",
                    "provider_name": "Constellation",
                    "rate_type": "fixed",
                    "source_document_id": str(document_id),
                },
            )

        assert response.status_code == 201
        assert mock_create.await_args.kwargs["fields"]["source_document_id"] == (
            document_id
        )

    def test_a_rejected_source_document_returns_422_not_500(
        self, client: TestClient,
    ) -> None:
        """Citing another organization's document is a bad request, not a crash.

        Only the service can tell — the id is well-formed and the row exists,
        it just is not ours. Before this route caught the error it escaped as a
        500 and told the caller nothing.
        """
        with patch(
            f"{_SERVICE}.create_plan",
            new_callable=AsyncMock,
            side_effect=InvalidUtilityPlanError(
                "source_document_id does not name a document",
            ),
        ):
            response = client.post(
                "/utility-plans",
                json={
                    "property_id": str(PROPERTY_ID),
                    "service_type": "electricity",
                    "provider_name": "Constellation",
                    "rate_type": "fixed",
                    "source_document_id": str(uuid.uuid4()),
                },
            )

        assert response.status_code == 422
        assert "source_document_id" in response.json()["detail"]

    def test_unknown_field_returns_422(self, client: TestClient) -> None:
        response = client.post(
            "/utility-plans",
            json={
                "property_id": str(PROPERTY_ID),
                "service_type": "electricity",
                "provider_name": "Constellation",
                "rate_type": "fixed",
                "kwh_used": 1200,
            },
        )
        assert response.status_code == 422


class TestExtract:
    """``POST /utility-plans/extract`` — reads a document, saves nothing."""

    def test_a_draft_comes_back_without_anything_being_saved(
        self, client: TestClient,
    ) -> None:
        document_id = uuid.uuid4()
        draft = UtilityPlanDraft(
            source_document_id=document_id,
            provider_name="Constellation",
            rate_type="fixed",
            confidence="high",
        )
        with patch(
            f"{_EXTRACTION}.extract_plan_from_document",
            new_callable=AsyncMock,
            return_value=draft,
        ) as mock_extract:
            with patch(f"{_SERVICE}.create_plan", new_callable=AsyncMock) as mock_create:
                response = client.post(
                    "/utility-plans/extract",
                    json={"document_id": str(document_id)},
                )

        assert response.status_code == 200
        assert response.json()["provider_name"] == "Constellation"
        assert mock_extract.await_args.kwargs["document_id"] == document_id
        mock_create.assert_not_called()

    def test_the_literal_path_is_not_swallowed_by_the_uuid_route(
        self, client: TestClient,
    ) -> None:
        """``/extract`` is declared before ``/{plan_id}``; this pins that order.

        Reversing them would send this request to ``get_plan``, which would
        reject "extract" as a malformed UUID — a 422 that looks like a payload
        problem and reads nothing like a routing bug.
        """
        with patch(f"{_SERVICE}.get_plan", new_callable=AsyncMock) as mock_get:
            with patch(
                f"{_EXTRACTION}.extract_plan_from_document",
                new_callable=AsyncMock,
                return_value=UtilityPlanDraft(source_document_id=uuid.uuid4()),
            ):
                response = client.post(
                    "/utility-plans/extract",
                    json={"document_id": str(uuid.uuid4())},
                )

        assert response.status_code == 200
        mock_get.assert_not_called()

    def test_a_document_we_do_not_own_returns_404(self, client: TestClient) -> None:
        """Same answer as a document that does not exist — no existence oracle."""
        with patch(
            f"{_EXTRACTION}.extract_plan_from_document",
            new_callable=AsyncMock,
            side_effect=DocumentNotFoundError("nope"),
        ):
            response = client.post(
                "/utility-plans/extract",
                json={"document_id": str(uuid.uuid4())},
            )

        assert response.status_code == 404
        assert response.json()["detail"] == "Document not found"

    def test_an_unreadable_document_returns_422_with_the_reason(
        self, client: TestClient,
    ) -> None:
        with patch(
            f"{_EXTRACTION}.extract_plan_from_document",
            new_callable=AsyncMock,
            side_effect=UnreadableDocumentError("Plan terms can be read from a PDF."),
        ):
            response = client.post(
                "/utility-plans/extract",
                json={"document_id": str(uuid.uuid4())},
            )

        assert response.status_code == 422
        assert "PDF" in response.json()["detail"]

    def test_a_missing_document_id_returns_422(self, client: TestClient) -> None:
        assert client.post("/utility-plans/extract", json={}).status_code == 422

    def test_an_unknown_field_returns_422(self, client: TestClient) -> None:
        response = client.post(
            "/utility-plans/extract",
            json={"document_id": str(uuid.uuid4()), "property_id": str(PROPERTY_ID)},
        )
        assert response.status_code == 422

    def test_the_caller_is_throttled_before_the_model_is_called_again(
        self, client: TestClient,
    ) -> None:
        """Each call is a paid model request; the upload cap does not bound re-reads."""
        limiter = utility_plan_extract_limiter
        with patch.object(limiter, "check", side_effect=HTTPException(429, "slow down")):
            with patch(
                f"{_EXTRACTION}.extract_plan_from_document", new_callable=AsyncMock,
            ) as mock_extract:
                response = client.post(
                    "/utility-plans/extract",
                    json={"document_id": str(uuid.uuid4())},
                )

        assert response.status_code == 429
        mock_extract.assert_not_called()

    def test_the_limit_is_keyed_per_user_not_globally(
        self, client: TestClient,
    ) -> None:
        """A shared key would let one operator's reading lock everyone else out."""
        with patch.object(utility_plan_extract_limiter, "check") as mock_check:
            with patch(
                f"{_EXTRACTION}.extract_plan_from_document",
                new_callable=AsyncMock,
                return_value=UtilityPlanDraft(source_document_id=uuid.uuid4()),
            ):
                client.post(
                    "/utility-plans/extract",
                    json={"document_id": str(uuid.uuid4())},
                )

        assert str(USER_ID) in mock_check.call_args.args[0]


class TestList:
    def test_forwards_filters_to_the_service(self, client: TestClient) -> None:
        empty = UtilityPlanListResponse(items=[], total=0, has_more=False)
        with patch(
            f"{_SERVICE}.list_plans", new_callable=AsyncMock, return_value=empty,
        ) as mock_list:
            response = client.get(
                "/utility-plans",
                params={
                    "property_id": str(PROPERTY_ID),
                    "service_type": "natural_gas",
                    "expiring_before": "2026-12-31",
                    "limit": 10,
                    "offset": 20,
                },
            )

        assert response.status_code == 200
        kwargs = mock_list.await_args.kwargs
        assert kwargs["property_id"] == PROPERTY_ID
        assert kwargs["service_type"] == "natural_gas"
        assert kwargs["expiring_before"] == _dt.date(2026, 12, 31)
        assert kwargs["limit"] == 10
        assert kwargs["offset"] == 20

    def test_limit_above_the_cap_returns_422(self, client: TestClient) -> None:
        response = client.get("/utility-plans", params={"limit": 500})
        assert response.status_code == 422


class TestRenewalAlerts:
    def test_literal_path_is_not_captured_by_the_uuid_route(
        self, client: TestClient,
    ) -> None:
        """Regression guard: /renewal-alerts must not resolve as a plan id."""
        payload = UtilityPlanRenewalAlertResponse(
            window_days=EXPIRING_SOON_DAYS,
            expired=[_summary()],
            expiring_soon=[],
            total_needing_attention=1,
        )
        with patch(
            f"{_SERVICE}.get_renewal_alerts",
            new_callable=AsyncMock,
            return_value=payload,
        ) as mock_alerts, patch(
            f"{_SERVICE}.get_plan", new_callable=AsyncMock,
        ) as mock_get:
            response = client.get("/utility-plans/renewal-alerts")

        assert response.status_code == 200
        assert mock_alerts.await_count == 1
        assert mock_get.await_count == 0
        assert response.json()["total_needing_attention"] == 1

    def test_window_days_is_forwarded(self, client: TestClient) -> None:
        payload = UtilityPlanRenewalAlertResponse(
            window_days=90, expired=[], expiring_soon=[], total_needing_attention=0,
        )
        with patch(
            f"{_SERVICE}.get_renewal_alerts",
            new_callable=AsyncMock,
            return_value=payload,
        ) as mock_alerts:
            response = client.get(
                "/utility-plans/renewal-alerts", params={"window_days": 90},
            )

        assert response.status_code == 200
        assert mock_alerts.await_args.kwargs["window_days"] == 90

    def test_window_days_out_of_range_returns_422(self, client: TestClient) -> None:
        response = client.get(
            "/utility-plans/renewal-alerts", params={"window_days": 0},
        )
        assert response.status_code == 422


class TestGet:
    def test_missing_plan_returns_404(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.get_plan",
            new_callable=AsyncMock,
            side_effect=UtilityPlanNotFoundError(str(PLAN_ID)),
        ):
            response = client.get(f"/utility-plans/{PLAN_ID}")
        assert response.status_code == 404

    def test_non_uuid_id_returns_422(self, client: TestClient) -> None:
        response = client.get("/utility-plans/not-a-uuid")
        assert response.status_code == 422


class TestUpdate:
    def test_only_sent_fields_reach_the_service(self, client: TestClient) -> None:
        """exclude_unset keeps "omitted" distinct from "set to null"."""
        with patch(
            f"{_SERVICE}.update_plan", new_callable=AsyncMock, return_value=_detail(),
        ) as mock_update:
            response = client.patch(
                f"/utility-plans/{PLAN_ID}", json={"plan_name": "Renewed 12"},
            )

        assert response.status_code == 200
        assert mock_update.await_args.kwargs["fields"] == {"plan_name": "Renewed 12"}

    def test_explicit_null_is_forwarded(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.update_plan", new_callable=AsyncMock, return_value=_detail(),
        ) as mock_update:
            client.patch(f"/utility-plans/{PLAN_ID}", json={"term_end_date": None})

        assert mock_update.await_args.kwargs["fields"] == {"term_end_date": None}

    def test_empty_body_reads_without_writing(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.get_plan", new_callable=AsyncMock, return_value=_detail(),
        ) as mock_get, patch(
            f"{_SERVICE}.update_plan", new_callable=AsyncMock,
        ) as mock_update:
            response = client.patch(f"/utility-plans/{PLAN_ID}", json={})

        assert response.status_code == 200
        assert mock_get.await_count == 1
        assert mock_update.await_count == 0

    def test_post_promo_alone_is_not_rejected_by_the_schema(
        self, client: TestClient,
    ) -> None:
        """The stored row may already carry the term end this price attaches to.

        Rejecting here would 422 a legitimate edit. Whether the merged row is
        consistent is the service's call, exercised below.
        """
        with patch(
            f"{_SERVICE}.update_plan", new_callable=AsyncMock, return_value=_detail(),
        ) as mock_update:
            response = client.patch(
                f"/utility-plans/{PLAN_ID}", json={"post_promo_monthly_cents": 9500},
            )

        assert response.status_code == 200
        assert mock_update.await_args.kwargs["fields"] == {
            "post_promo_monthly_cents": 9500,
        }

    def test_inconsistent_merge_returns_422_not_500(
        self, client: TestClient,
    ) -> None:
        with patch(
            f"{_SERVICE}.update_plan",
            new_callable=AsyncMock,
            side_effect=InvalidUtilityPlanError(
                "term_end_date must be on or after service_start_date",
            ),
        ):
            response = client.patch(
                f"/utility-plans/{PLAN_ID}", json={"term_end_date": "2020-01-01"},
            )

        assert response.status_code == 422
        assert "service_start_date" in response.json()["detail"]

    def test_missing_plan_returns_404(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.update_plan",
            new_callable=AsyncMock,
            side_effect=UtilityPlanNotFoundError(str(PLAN_ID)),
        ):
            response = client.patch(
                f"/utility-plans/{PLAN_ID}", json={"plan_name": "X"},
            )
        assert response.status_code == 404


class TestDelete:
    def test_returns_204(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.soft_delete_plan", new_callable=AsyncMock, return_value=None,
        ) as mock_delete:
            response = client.delete(f"/utility-plans/{PLAN_ID}")

        assert response.status_code == 204
        assert mock_delete.await_args.kwargs["plan_id"] == PLAN_ID

    def test_missing_plan_returns_404(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.soft_delete_plan",
            new_callable=AsyncMock,
            side_effect=UtilityPlanNotFoundError(str(PLAN_ID)),
        ):
            response = client.delete(f"/utility-plans/{PLAN_ID}")
        assert response.status_code == 404


class TestPermissions:
    def test_write_routes_reject_a_read_only_member(self) -> None:
        """Only ``current_org_member`` is overridden, so the real
        ``require_write_access`` runs against a viewer context and 403s."""
        app.dependency_overrides[current_org_member] = lambda: _ctx(OrgRole.VIEWER)
        try:
            client = TestClient(app)
            assert client.post(
                "/utility-plans",
                json={
                    "property_id": str(PROPERTY_ID),
                    "service_type": "electricity",
                    "provider_name": "Constellation",
                    "rate_type": "fixed",
                },
            ).status_code == 403
            assert client.patch(
                f"/utility-plans/{PLAN_ID}", json={"plan_name": "X"},
            ).status_code == 403
            assert client.delete(f"/utility-plans/{PLAN_ID}").status_code == 403
        finally:
            app.dependency_overrides.clear()

    def test_read_routes_allow_a_read_only_member(self) -> None:
        app.dependency_overrides[current_org_member] = lambda: _ctx(OrgRole.VIEWER)
        empty = UtilityPlanListResponse(items=[], total=0, has_more=False)
        try:
            with patch(
                f"{_SERVICE}.list_plans", new_callable=AsyncMock, return_value=empty,
            ):
                assert TestClient(app).get("/utility-plans").status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_read_routes_require_authentication(self) -> None:
        app.dependency_overrides.clear()
        client = TestClient(app)
        assert client.get("/utility-plans").status_code == 401
        assert client.get("/utility-plans/renewal-alerts").status_code == 401
        assert client.get("/utility-plans/offers").status_code == 401


class TestFindBetterPlans:
    def test_offers_is_not_swallowed_by_the_uuid_route(
        self, client: TestClient,
    ) -> None:
        """``/offers`` is declared before ``/{plan_id}``; this pins that order.

        Reversing them would send this to ``get_plan``, which rejects "offers"
        as a malformed UUID — a 422 that reads like a payload problem and
        nothing like the routing bug it would actually be.
        """
        with patch(f"{_SERVICE}.get_plan", new_callable=AsyncMock) as mock_get:
            with patch(
                f"{_OFFERS}.find_better_plans",
                new_callable=AsyncMock,
                return_value=UtilityOfferSearchResponse(
                    groups=[], reference_annual_kwh=12_000,
                ),
            ):
                response = client.get("/utility-plans/offers")

        assert response.status_code == 200
        mock_get.assert_not_called()

    def test_the_minimum_term_is_passed_through(self, client: TestClient) -> None:
        with patch(
            f"{_OFFERS}.find_better_plans",
            new_callable=AsyncMock,
            return_value=UtilityOfferSearchResponse(
                groups=[], reference_annual_kwh=12_000,
            ),
        ) as mock_find:
            response = client.get("/utility-plans/offers?min_term_months=24")

        assert response.status_code == 200
        assert mock_find.await_args.kwargs["min_term_months"] == 24

    def test_an_absurd_term_is_rejected(self, client: TestClient) -> None:
        assert client.get("/utility-plans/offers?min_term_months=0").status_code == 422
        assert client.get("/utility-plans/offers?min_term_months=99").status_code == 422

    def test_a_read_only_member_may_search(self) -> None:
        """Searching the market changes nothing, so a viewer may do it."""
        app.dependency_overrides[current_org_member] = lambda: _ctx(OrgRole.VIEWER)
        try:
            with patch(
                f"{_OFFERS}.find_better_plans",
                new_callable=AsyncMock,
                return_value=UtilityOfferSearchResponse(
                    groups=[], reference_annual_kwh=12_000,
                ),
            ):
                assert TestClient(app).get("/utility-plans/offers").status_code == 200
        finally:
            app.dependency_overrides.clear()
