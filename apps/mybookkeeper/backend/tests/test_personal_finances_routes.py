"""HTTP route for the personal finances page.

The member dependency is overridden and the service patched; the service has
its own tests against the database (``test_personal_finances_service``).
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.services.personal_finances import personal_finances_service
from app.services.personal_finances.personal_finances_service import (
    InvalidPersonalFinancesRangeError,
)

_SERVICE = "app.api.personal_finances.personal_finances_service"


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture()
def ctx():
    context = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.VIEWER)
    app.dependency_overrides[current_org_member] = lambda: context
    yield context
    app.dependency_overrides.clear()


def test_passes_the_range_through(client, ctx) -> None:
    empty = personal_finances_service.nothing_yet()
    with patch(f"{_SERVICE}.get_personal_finances", new=AsyncMock(return_value=empty)) as get:
        resp = client.get("/personal-finances", params={"start": "2026-01", "end": "2026-06"})
    assert resp.status_code == 200
    assert resp.json()["bank_history_start"] is None
    kwargs = get.await_args.kwargs
    assert (kwargs["organization_id"], kwargs["start"], kwargs["end"]) == (ctx.organization_id, "2026-01", "2026-06")


def test_leaving_the_range_out_asks_for_all_of_it(client, ctx) -> None:
    empty = personal_finances_service.nothing_yet()
    with patch(f"{_SERVICE}.get_personal_finances", new=AsyncMock(return_value=empty)) as get:
        client.get("/personal-finances")
    assert (get.await_args.kwargs["start"], get.await_args.kwargs["end"]) == (None, None)


def test_a_bad_range_is_422(client, ctx) -> None:
    with patch(
        f"{_SERVICE}.get_personal_finances", new=AsyncMock(side_effect=InvalidPersonalFinancesRangeError("2026-13")),
    ):
        resp = client.get("/personal-finances", params={"start": "2026-13"})
    assert resp.status_code == 422
