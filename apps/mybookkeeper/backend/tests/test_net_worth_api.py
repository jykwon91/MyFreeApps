"""Route-level contract for /net-worth and PUT /properties/{id}/estimated-value.

Services are mocked (their behaviour is in ``test_net_worth_service``).
Pinned: both routes are scoped to the caller's workspace and person, an
unknown range is a 422, a negative or absurd value is a 422, another
workspace's property is a 404, and the routes need a signed-in member.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.net_worth_constants import DEFAULT_RANGE, PROPERTY_VALUE_MAX_CENTS
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.net_worth.net_worth_history_response import NetWorthHistoryResponse
from app.schemas.net_worth.net_worth_response import NetWorthResponse
from app.schemas.properties.property_value_response import PropertyValueResponse
from app.services.net_worth import net_worth_service
from app.services.properties.property_not_found_error import PropertyNotFoundError

_NET_WORTH = "app.api.net_worth.net_worth_service"
_PROPERTY_VALUE = "app.api.properties.property_value_service"
_CTX = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)


@pytest.fixture()
def client() -> Iterator[TestClient]:
    app.dependency_overrides[require_write_access] = lambda: _CTX
    app.dependency_overrides[current_org_member] = lambda: _CTX
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_current_net_worth_is_the_callers(client: TestClient) -> None:
    body = NetWorthResponse(
        currency="USD", as_of=_dt.date.today(), assets_cents=5, liabilities_cents=2, net_cents=3, groups=[],
    )
    service = AsyncMock(return_value=body)
    with patch(f"{_NET_WORTH}.get_net_worth", service):
        res = client.get("/net-worth")
    assert res.status_code == 200
    assert res.json()["net_cents"] == 3
    assert service.await_args.kwargs["organization_id"] == _CTX.organization_id
    assert service.await_args.kwargs["user_id"] == _CTX.user_id


def test_history_defaults_its_range(client: TestClient) -> None:
    service = AsyncMock(return_value=NetWorthHistoryResponse(range=DEFAULT_RANGE, currency="USD", points=[]))
    with patch(f"{_NET_WORTH}.get_history", service):
        res = client.get("/net-worth/history")
    assert res.status_code == 200
    assert service.await_args.kwargs["range_key"] == DEFAULT_RANGE


def test_an_unknown_range_is_422(client: TestClient) -> None:
    service = AsyncMock(side_effect=net_worth_service.InvalidNetWorthRangeError("5y"))
    with patch(f"{_NET_WORTH}.get_history", service):
        res = client.get("/net-worth/history", params={"range": "5y"})
    assert res.status_code == 422


def test_signed_out_is_refused() -> None:
    assert TestClient(app).get("/net-worth").status_code == 401


class TestPropertyValue:
    def test_saves_for_the_callers_workspace(self, client: TestClient) -> None:
        prop_id = uuid.uuid4()
        service = AsyncMock(return_value=PropertyValueResponse(
            property_id=prop_id, estimated_value_cents=1_00, estimated_value_as_of=_dt.date.today(),
        ))
        with patch(f"{_PROPERTY_VALUE}.set_estimated_value", service):
            res = client.put(f"/properties/{prop_id}/estimated-value", json={"estimated_value_cents": 1_00})
        assert res.status_code == 200
        assert service.await_args.kwargs["organization_id"] == _CTX.organization_id
        assert service.await_args.kwargs["value_cents"] == 1_00

    def test_null_clears_it(self, client: TestClient) -> None:
        prop_id = uuid.uuid4()
        service = AsyncMock(return_value=PropertyValueResponse(property_id=prop_id))
        with patch(f"{_PROPERTY_VALUE}.set_estimated_value", service):
            res = client.put(f"/properties/{prop_id}/estimated-value", json={"estimated_value_cents": None})
        assert res.status_code == 200
        assert service.await_args.kwargs["value_cents"] is None

    @pytest.mark.parametrize(
        "body",
        [{"estimated_value_cents": -1}, {"estimated_value_cents": PROPERTY_VALUE_MAX_CENTS + 1}, {}, {"estimated_value_cents": 1, "as_of": "2020-01-01"}],
        ids=["negative", "absurd", "missing", "client-chosen date"],
    )
    def test_bad_values_are_422(self, client: TestClient, body: dict[str, object]) -> None:
        with patch(f"{_PROPERTY_VALUE}.set_estimated_value", AsyncMock()) as service:
            res = client.put(f"/properties/{uuid.uuid4()}/estimated-value", json=body)
        assert res.status_code == 422
        service.assert_not_awaited()

    def test_another_workspaces_property_is_404(self, client: TestClient) -> None:
        service = AsyncMock(side_effect=PropertyNotFoundError("x"))
        with patch(f"{_PROPERTY_VALUE}.set_estimated_value", service):
            res = client.put(f"/properties/{uuid.uuid4()}/estimated-value", json={"estimated_value_cents": 1})
        assert res.status_code == 404
