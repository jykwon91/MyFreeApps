"""Route-level contract for /plaid.

Services are mocked (their behaviour is in the ``test_plaid_*_service``
files). Pinned here: each service failure maps to its status (404 not found,
409 login_required, 422 bad connection, 502 Plaid down, 503 not set up), a
connect and a reconnect queue the first sync, a webhook with a bad signature
is a 401 and never reaches the handler, and a verified sync webhook queues a
sync of the item it names.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import plaid as plaid_routes
from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org_write
from app.core.plaid_not_configured_error import PlaidNotConfiguredError
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.plaid.plaid_item_response import PlaidItemResponse
from app.schemas.plaid.plaid_link_token_response import PlaidLinkTokenResponse
from app.schemas.plaid.plaid_sync_result import PlaidSyncResult
from app.services.plaid.invalid_plaid_connection_error import InvalidPlaidConnectionError
from app.services.plaid.plaid_api_error import PlaidApiError
from app.services.plaid.plaid_item_not_found_error import PlaidItemNotFoundError
from app.services.plaid.plaid_login_required_error import PlaidLoginRequiredError
from app.services.plaid.plaid_webhook_verification_error import PlaidWebhookVerificationError

_ITEMS = "app.api.plaid.plaid_item_service"
_SYNC = "app.api.plaid.plaid_sync_service"
_VERIFY = "app.api.plaid.plaid_webhook_verifier.verify"
_HANDLE = "app.api.plaid.plaid_webhook_service.handle"
_ITEM_ID = uuid.uuid4()
_CONNECT_BODY = {"public_token": "public-sandbox-1", "accounts": [{"plaid_account_id": "acc-1"}]}
_OUTAGE = PlaidApiError(
    endpoint="/item/public_token/exchange", status_code=500, error_type="API_ERROR",
    error_code="INTERNAL_SERVER_ERROR", request_id="r",
)


def _item() -> PlaidItemResponse:
    return PlaidItemResponse(
        id=_ITEM_ID, institution_name="Chase", status="active", error_code=None,
        last_synced_at=None, account_count=1, created_at=_dt.datetime(2026, 11, 23, tzinfo=_dt.timezone.utc),
    )


@pytest.fixture()
def client() -> Iterator[TestClient]:
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    app.dependency_overrides[reject_demo_org_write] = lambda: ctx
    app.dependency_overrides[current_org_member] = lambda: ctx
    plaid_routes._sync_limiter.reset()
    plaid_routes._webhook_limiter.reset()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


class TestLinkToken:
    def test_returns_the_token(self, client: TestClient) -> None:
        token = PlaidLinkTokenResponse(
            link_token="link-1", expiration=_dt.datetime(2026, 11, 23, tzinfo=_dt.timezone.utc),
        )
        with patch(f"{_ITEMS}.create_link_token", AsyncMock(return_value=token)):
            response = client.post("/plaid/link-token", json={})
        assert response.status_code == 200
        assert response.json()["link_token"] == "link-1"

    def test_not_set_up_is_a_503(self, client: TestClient) -> None:
        with patch(f"{_ITEMS}.create_link_token", AsyncMock(side_effect=PlaidNotConfiguredError("x"))):
            assert client.post("/plaid/link-token", json={}).status_code == 503

    def test_plaid_down_is_a_502_in_plain_words(self, client: TestClient) -> None:
        with patch(f"{_ITEMS}.create_link_token", AsyncMock(side_effect=_OUTAGE)):
            response = client.post("/plaid/link-token", json={})
        assert response.status_code == 502
        assert "INTERNAL_SERVER_ERROR" not in response.text

    def test_reconnecting_someone_elses_item_is_a_404(self, client: TestClient) -> None:
        with patch(f"{_ITEMS}.create_link_token", AsyncMock(side_effect=PlaidItemNotFoundError("x"))):
            assert client.post("/plaid/link-token", json={"item_id": str(_ITEM_ID)}).status_code == 404


class TestConnect:
    def test_connect_answers_201_and_queues_the_first_sync(self, client: TestClient) -> None:
        sync = AsyncMock()
        with patch(f"{_ITEMS}.connect", AsyncMock(return_value=_item())), patch(f"{_SYNC}.sync_item_in_background", sync):
            response = client.post("/plaid/items", json=_CONNECT_BODY)
        assert response.status_code == 201
        assert response.json()["institution_name"] == "Chase"
        sync.assert_awaited_once_with(_ITEM_ID)

    def test_no_accounts_is_a_422(self, client: TestClient) -> None:
        assert client.post("/plaid/items", json={"public_token": "p", "accounts": []}).status_code == 422

    def test_the_same_bank_account_twice_is_a_422(self, client: TestClient) -> None:
        body = {"public_token": "p", "accounts": [{"plaid_account_id": "a"}, {"plaid_account_id": "a"}]}
        assert client.post("/plaid/items", json=body).status_code == 422

    def test_an_unknown_scope_is_a_422(self, client: TestClient) -> None:
        body = {"public_token": "p", "accounts": [{"plaid_account_id": "a", "default_transaction_scope": "mine"}]}
        assert client.post("/plaid/items", json=body).status_code == 422

    def test_a_bad_connection_is_a_422_with_the_reason(self, client: TestClient) -> None:
        refusal = InvalidPlaidConnectionError("This bank connection is already saved")
        with patch(f"{_ITEMS}.connect", AsyncMock(side_effect=refusal)):
            response = client.post("/plaid/items", json=_CONNECT_BODY)
        assert response.status_code == 422
        assert response.json()["detail"] == "This bank connection is already saved"

    def test_plaid_down_is_a_502(self, client: TestClient) -> None:
        with patch(f"{_ITEMS}.connect", AsyncMock(side_effect=_OUTAGE)):
            assert client.post("/plaid/items", json=_CONNECT_BODY).status_code == 502


class TestSyncReconnectDisconnect:
    def test_sync_now_returns_the_counts(self, client: TestClient) -> None:
        result = PlaidSyncResult(added=3, modified=1, removed=0, matched_existing=2, transfers_matched=1, status="active")
        with patch(f"{_SYNC}.sync_for_user", AsyncMock(return_value=result)):
            response = client.post(f"/plaid/items/{_ITEM_ID}/sync")
        assert response.status_code == 200
        assert response.json()["added"] == 3

    def test_sync_now_on_an_item_needing_reconnect_is_a_409(self, client: TestClient) -> None:
        with patch(f"{_SYNC}.sync_for_user", AsyncMock(side_effect=PlaidLoginRequiredError("x"))):
            response = client.post(f"/plaid/items/{_ITEM_ID}/sync")
        assert response.status_code == 409
        assert response.json()["detail"] == "login_required"

    def test_sync_now_on_someone_elses_item_is_a_404(self, client: TestClient) -> None:
        with patch(f"{_SYNC}.sync_for_user", AsyncMock(side_effect=PlaidItemNotFoundError("x"))):
            assert client.post(f"/plaid/items/{_ITEM_ID}/sync").status_code == 404

    def test_reconnected_queues_a_sync(self, client: TestClient) -> None:
        sync = AsyncMock()
        with patch(f"{_ITEMS}.mark_reconnected", AsyncMock(return_value=_item())), patch(f"{_SYNC}.sync_item_in_background", sync):
            assert client.post(f"/plaid/items/{_ITEM_ID}/reconnected").status_code == 200
        sync.assert_awaited_once_with(_ITEM_ID)

    def test_disconnect_is_a_204(self, client: TestClient) -> None:
        disconnect = AsyncMock()
        with patch(f"{_ITEMS}.disconnect", disconnect):
            assert client.delete(f"/plaid/items/{_ITEM_ID}").status_code == 204
        disconnect.assert_awaited_once()

    def test_disconnect_while_plaid_is_down_is_a_502(self, client: TestClient) -> None:
        with patch(f"{_ITEMS}.disconnect", AsyncMock(side_effect=_OUTAGE)):
            assert client.delete(f"/plaid/items/{_ITEM_ID}").status_code == 502

    def test_list_returns_the_items(self, client: TestClient) -> None:
        with patch(f"{_ITEMS}.list_items", AsyncMock(return_value=[_item()])):
            response = client.get("/plaid/items")
        assert [i["account_count"] for i in response.json()] == [1]


class TestWebhook:
    def test_a_bad_signature_is_a_401_and_never_handled(self, client: TestClient) -> None:
        handle = AsyncMock()
        with patch(_VERIFY, AsyncMock(side_effect=PlaidWebhookVerificationError("signature check failed"))), patch(_HANDLE, handle):
            response = client.post("/plaid/webhook", content=b"{}", headers={"Plaid-Verification": "x"})
        assert response.status_code == 401
        handle.assert_not_awaited()

    def test_the_exact_body_and_header_are_verified(self, client: TestClient) -> None:
        verify = AsyncMock()
        body = b'{"webhook_type":"ITEM","webhook_code":"LOGIN_REPAIRED","item_id":"i"}'
        with patch(_VERIFY, verify), patch(_HANDLE, AsyncMock(return_value=None)):
            response = client.post("/plaid/webhook", content=body, headers={"Plaid-Verification": "jwt-1"})
        assert response.status_code == 200
        verify.assert_awaited_once_with(body, "jwt-1")

    def test_a_verified_sync_webhook_queues_a_sync(self, client: TestClient) -> None:
        sync = AsyncMock()
        with (
            patch(_VERIFY, AsyncMock()),
            patch(_HANDLE, AsyncMock(return_value=_ITEM_ID)),
            patch(f"{_SYNC}.sync_item_in_background", sync),
        ):
            assert client.post("/plaid/webhook", content=b"{}", headers={"Plaid-Verification": "x"}).status_code == 200
        sync.assert_awaited_once_with(_ITEM_ID)
