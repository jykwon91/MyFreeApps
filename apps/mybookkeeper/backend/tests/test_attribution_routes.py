"""HTTP route tests for /transactions/attribution-review-queue and
/dashboard/property-pnl endpoints.

Uses dependency_overrides on ``current_org_member`` / ``require_write_access``
and patches service calls — no real DB required.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.transactions.attribution import (
    AttributionReviewQueueResponse,
    AttributionReviewItemRead,
    PropertyPnLResponse,
)


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _queue_item(org_id: uuid.UUID) -> AttributionReviewItemRead:
    return AttributionReviewItemRead(
        id=uuid.uuid4(),
        transaction_id=uuid.uuid4(),
        proposed_applicant_id=uuid.uuid4(),
        confidence="fuzzy",
        status="pending",
        created_at=datetime.now(timezone.utc),
        resolved_at=None,
        transaction=None,
        proposed_applicant=None,
    )


@pytest.fixture()
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture()
def org_id():
    return uuid.uuid4()


@pytest.fixture()
def user_id():
    return uuid.uuid4()


@pytest.fixture()
def override_ctx(org_id, user_id):
    ctx = _ctx(org_id, user_id)
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[require_write_access] = lambda: ctx
    yield ctx
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /transactions/attribution-review-queue
# ---------------------------------------------------------------------------

class TestListAttributionQueue:
    def test_returns_queue(self, client, override_ctx, org_id):
        item = _queue_item(org_id)
        queue_resp = AttributionReviewQueueResponse(
            items=[item], total=1, pending_count=1,
        )
        with (
            patch(
                "app.services.transactions.attribution_service.list_review_queue",
                new_callable=AsyncMock,
                return_value=[item],
            ),
            patch(
                "app.services.transactions.attribution_service.count_pending_reviews",
                new_callable=AsyncMock,
                return_value=1,
            ),
        ):
            resp = client.get("/transactions/attribution-review-queue")
        assert resp.status_code == 200
        body = resp.json()
        assert body["pending_count"] == 1
        assert len(body["items"]) == 1

    def test_empty_queue(self, client, override_ctx):
        with (
            patch(
                "app.services.transactions.attribution_service.list_review_queue",
                new_callable=AsyncMock,
                return_value=[],
            ),
            patch(
                "app.services.transactions.attribution_service.count_pending_reviews",
                new_callable=AsyncMock,
                return_value=0,
            ),
        ):
            resp = client.get("/transactions/attribution-review-queue")
        assert resp.status_code == 200
        assert resp.json()["pending_count"] == 0
        assert resp.json()["items"] == []

    def test_requires_auth(self, client):
        """No dependency override → no context → 422 (FastAPI can't inject ctx)."""
        resp = client.get("/transactions/attribution-review-queue")
        assert resp.status_code in (401, 422)


# ---------------------------------------------------------------------------
# POST /transactions/attribution-review-queue/{id}/confirm
# ---------------------------------------------------------------------------

class TestConfirmAttributionReview:
    def test_confirm_happy_path(self, client, override_ctx):
        review_id = uuid.uuid4()
        with patch(
            "app.services.transactions.attribution_service.confirm_review",
            new_callable=AsyncMock,
            return_value={"ok": True, "transaction_id": str(uuid.uuid4())},
        ):
            resp = client.post(
                f"/transactions/attribution-review-queue/{review_id}/confirm",
                json={"applicant_id": None},
            )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_confirm_not_found(self, client, override_ctx):
        review_id = uuid.uuid4()
        with patch(
            "app.services.transactions.attribution_service.confirm_review",
            new_callable=AsyncMock,
            side_effect=ValueError("Review item not found"),
        ):
            resp = client.post(
                f"/transactions/attribution-review-queue/{review_id}/confirm",
                json={"applicant_id": None},
            )
        assert resp.status_code == 404

    def test_confirm_already_resolved(self, client, override_ctx):
        review_id = uuid.uuid4()
        with patch(
            "app.services.transactions.attribution_service.confirm_review",
            new_callable=AsyncMock,
            side_effect=ValueError("Review item is already resolved"),
        ):
            resp = client.post(
                f"/transactions/attribution-review-queue/{review_id}/confirm",
                json={"applicant_id": None},
            )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /transactions/attribution-review-queue/{id}/reject
# ---------------------------------------------------------------------------

class TestRejectAttributionReview:
    def test_reject_happy_path(self, client, override_ctx):
        review_id = uuid.uuid4()
        with patch(
            "app.services.transactions.attribution_service.reject_review",
            new_callable=AsyncMock,
            return_value={"ok": True},
        ):
            resp = client.post(
                f"/transactions/attribution-review-queue/{review_id}/reject",
            )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_reject_not_found(self, client, override_ctx):
        review_id = uuid.uuid4()
        with patch(
            "app.services.transactions.attribution_service.reject_review",
            new_callable=AsyncMock,
            side_effect=ValueError("Review item not found"),
        ):
            resp = client.post(
                f"/transactions/attribution-review-queue/{review_id}/reject",
            )
        assert resp.status_code == 404

    def test_cross_tenant_isolation(self, client, user_id):
        """A different org's ctx must not be able to reject an item
        from a different org — the service enforces org_id and raises ValueError."""
        other_org = uuid.uuid4()
        other_ctx = _ctx(other_org, user_id)
        app.dependency_overrides[current_org_member] = lambda: other_ctx
        app.dependency_overrides[require_write_access] = lambda: other_ctx

        review_id = uuid.uuid4()
        try:
            with patch(
                "app.services.transactions.attribution_service.reject_review",
                new_callable=AsyncMock,
                side_effect=ValueError("Review item not found"),
            ):
                resp = client.post(
                    f"/transactions/attribution-review-queue/{review_id}/reject",
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /transactions/{id}/attribute
# ---------------------------------------------------------------------------

class TestAttributeManually:
    def test_attribute_happy_path(self, client, override_ctx):
        txn_id = uuid.uuid4()
        applicant_id = uuid.uuid4()
        with patch(
            "app.services.transactions.attribution_service.attribute_manually",
            new_callable=AsyncMock,
            return_value={"ok": True, "transaction_id": str(txn_id)},
        ):
            resp = client.post(
                f"/transactions/{txn_id}/attribute",
                json={"applicant_id": str(applicant_id)},
            )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_attribute_missing_applicant_id_rejected(self, client, override_ctx):
        txn_id = uuid.uuid4()
        # applicant_id is required by schema (extra=forbid)
        resp = client.post(
            f"/transactions/{txn_id}/attribute",
            json={},
        )
        assert resp.status_code == 422

    def test_attribute_extra_field_rejected(self, client, override_ctx):
        txn_id = uuid.uuid4()
        resp = client.post(
            f"/transactions/{txn_id}/attribute",
            json={"applicant_id": str(uuid.uuid4()), "evil_field": "injected"},
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /dashboard/property-pnl
# ---------------------------------------------------------------------------

class TestPropertyPnl:
    def test_happy_path(self, client, override_ctx):
        pnl = PropertyPnLResponse(
            since=date(2026, 1, 1),
            until=date(2026, 3, 31),
            properties=[],
            total_revenue_cents=0,
            total_expenses_cents=0,
            total_net_cents=0,
        )
        with patch(
            "app.services.transactions.property_pnl_service.get_property_pnl",
            new_callable=AsyncMock,
            return_value=pnl,
        ):
            resp = client.get("/dashboard/property-pnl?since=2026-01-01&until=2026-03-31")
        assert resp.status_code == 200
        body = resp.json()
        assert body["since"] == "2026-01-01"
        assert body["until"] == "2026-03-31"

    def test_since_after_until_rejected(self, client, override_ctx):
        with patch(
            "app.services.transactions.property_pnl_service.get_property_pnl",
            new_callable=AsyncMock,
        ):
            resp = client.get("/dashboard/property-pnl?since=2026-03-31&until=2026-01-01")
        assert resp.status_code == 422

    def test_missing_date_params_rejected(self, client, override_ctx):
        resp = client.get("/dashboard/property-pnl")
        assert resp.status_code == 422
