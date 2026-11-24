"""Route-level contract for /financial-accounts.

The service is mocked (its behaviour is in ``test_financial_accounts_service``).
Pinned here: payload validation answers 422, another person's account is a 404,
an empty PATCH reads the row back without writing, and a restore that would
link a mortgage twice is a 409 rather than a 500.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.financial_accounts.financial_account_response import FinancialAccountResponse
from app.services.financial_accounts import financial_account_service

_SERVICE = "app.api.financial_accounts.financial_account_service"


@pytest.fixture()
def client() -> Iterator[TestClient]:
    ctx = RequestContext(
        organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
    )
    app.dependency_overrides[require_write_access] = lambda: ctx
    app.dependency_overrides[current_org_member] = lambda: ctx
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _response() -> FinancialAccountResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return FinancialAccountResponse(
        id=uuid.uuid4(), organization_id=uuid.uuid4(), user_id=uuid.uuid4(),
        name="Chase Checking", account_type="checking", classification="asset",
        currency="USD", created_at=now, updated_at=now,
    )


class TestCreate:
    def test_happy_path_is_201(self, client: TestClient) -> None:
        with patch(f"{_SERVICE}.create_account", AsyncMock(return_value=_response())):
            res = client.post(
                "/financial-accounts", json={"name": "Chase Checking", "account_type": "checking"},
            )
        assert res.status_code == 201
        assert res.json()["classification"] == "asset"

    @pytest.mark.parametrize(
        "body",
        [
            {"name": "x", "account_type": "piggy_bank"},
            {"name": "   ", "account_type": "checking"},
            {"name": "x", "account_type": "checking", "mask": "123456789012"},
            {"name": "x", "account_type": "checking", "mask": "48-1"},
            {"name": "x", "account_type": "checking", "currency": "dollars"},
        ],
        ids=["unknown type", "blank name", "full account number", "punctuated mask", "bad currency"],
    )
    def test_bad_fields_are_422(self, client: TestClient, body: dict[str, str]) -> None:
        with patch(f"{_SERVICE}.create_account", AsyncMock()) as create:
            res = client.post("/financial-accounts", json=body)
        assert res.status_code == 422
        create.assert_not_awaited()

    def test_a_rejected_account_is_422(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.create_account",
            AsyncMock(side_effect=financial_account_service.InvalidFinancialAccountError("nope")),
        ):
            res = client.post(
                "/financial-accounts", json={"name": "x", "account_type": "checking"},
            )
        assert res.status_code == 422


class TestReadAndUpdate:
    def test_someone_else_s_account_is_404(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.get_account",
            AsyncMock(side_effect=financial_account_service.FinancialAccountNotFoundError()),
        ):
            res = client.get(f"/financial-accounts/{uuid.uuid4()}")
        assert res.status_code == 404

    def test_an_empty_patch_reads_the_row_back(self, client: TestClient) -> None:
        with patch(f"{_SERVICE}.get_account", AsyncMock(return_value=_response())) as get, patch(
            f"{_SERVICE}.update_account", AsyncMock(),
        ) as update:
            res = client.patch(f"/financial-accounts/{uuid.uuid4()}", json={})
        assert res.status_code == 200
        get.assert_awaited_once()
        update.assert_not_awaited()

    def test_an_explicit_null_reaches_the_service(self, client: TestClient) -> None:
        """Reopening a closed account is ``closed_on: null`` — it must not be dropped."""
        with patch(f"{_SERVICE}.update_account", AsyncMock(return_value=_response())) as update:
            res = client.patch(f"/financial-accounts/{uuid.uuid4()}", json={"closed_on": None})
        assert res.status_code == 200
        assert update.await_args.kwargs["fields"] == {"closed_on": None}


class TestDeleteAndRestore:
    def test_delete_is_204(self, client: TestClient) -> None:
        with patch(f"{_SERVICE}.delete_account", AsyncMock()):
            res = client.delete(f"/financial-accounts/{uuid.uuid4()}")
        assert res.status_code == 204

    def test_restore_conflict_is_409(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.restore_account",
            AsyncMock(side_effect=financial_account_service.InvalidFinancialAccountError("linked")),
        ):
            res = client.post(f"/financial-accounts/{uuid.uuid4()}/restore")
        assert res.status_code == 409
