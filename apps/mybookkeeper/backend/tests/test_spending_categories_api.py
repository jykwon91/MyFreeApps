"""Route-level contract for /spending-categories.

The service is mocked (its behaviour is in ``test_spending_categories_service``).
Pinned here: 201 on create, 422 for blank/too-long names, 404 for another org's
category, 409 for duplicate names, and archive/unarchive endpoints return the
updated category.
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
from app.schemas.spending_categories.spending_category_response import SpendingCategoryResponse
from app.services.spending_categories import spending_category_service

_SERVICE = "app.api.spending_categories.spending_category_service"


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


def _response(name: str = "Food & Dining", archived: bool = False) -> SpendingCategoryResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return SpendingCategoryResponse(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        name=name,
        is_default=False,
        archived_at=now if archived else None,
        created_at=now,
        updated_at=now,
    )


class TestList:
    def test_returns_200_with_items(self, client: TestClient) -> None:
        from app.schemas.spending_categories.spending_category_list_response import SpendingCategoryListResponse
        payload = SpendingCategoryListResponse(items=[_response("Food & Dining")])
        with patch(f"{_SERVICE}.list_categories", AsyncMock(return_value=payload)):
            res = client.get("/spending-categories")
        assert res.status_code == 200
        assert res.json()["items"][0]["name"] == "Food & Dining"

    def test_include_archived_param_is_forwarded(self, client: TestClient) -> None:
        from app.schemas.spending_categories.spending_category_list_response import SpendingCategoryListResponse
        payload = SpendingCategoryListResponse(items=[])
        with patch(f"{_SERVICE}.list_categories", AsyncMock(return_value=payload)) as svc:
            res = client.get("/spending-categories?include_archived=true")
        assert res.status_code == 200
        svc.assert_awaited_once()
        _, kwargs = svc.call_args
        assert kwargs.get("include_archived") is True


class TestCreate:
    def test_happy_path_is_201(self, client: TestClient) -> None:
        with patch(f"{_SERVICE}.create_category", AsyncMock(return_value=_response("Restaurants"))):
            res = client.post("/spending-categories", json={"name": "Restaurants"})
        assert res.status_code == 201
        assert res.json()["name"] == "Restaurants"

    def test_blank_name_is_422(self, client: TestClient) -> None:
        with patch(f"{_SERVICE}.create_category", AsyncMock()) as svc:
            res = client.post("/spending-categories", json={"name": "   "})
        assert res.status_code == 422
        svc.assert_not_awaited()

    def test_too_long_name_is_422(self, client: TestClient) -> None:
        with patch(f"{_SERVICE}.create_category", AsyncMock()) as svc:
            res = client.post("/spending-categories", json={"name": "x" * 101})
        assert res.status_code == 422
        svc.assert_not_awaited()

    def test_duplicate_name_is_409(self, client: TestClient) -> None:
        with patch(
            f"{_SERVICE}.create_category",
            AsyncMock(side_effect=spending_category_service.SpendingCategoryConflictError("dup")),
        ):
            res = client.post("/spending-categories", json={"name": "Food & Dining"})
        assert res.status_code == 409


class TestUpdate:
    def test_happy_path_returns_200(self, client: TestClient) -> None:
        cat_id = uuid.uuid4()
        with patch(f"{_SERVICE}.update_category", AsyncMock(return_value=_response("Updated"))):
            res = client.patch(f"/spending-categories/{cat_id}", json={"name": "Updated"})
        assert res.status_code == 200
        assert res.json()["name"] == "Updated"

    def test_not_found_is_404(self, client: TestClient) -> None:
        cat_id = uuid.uuid4()
        with patch(
            f"{_SERVICE}.update_category",
            AsyncMock(side_effect=spending_category_service.SpendingCategoryNotFoundError("not found")),
        ):
            res = client.patch(f"/spending-categories/{cat_id}", json={"name": "New"})
        assert res.status_code == 404

    def test_conflict_is_409(self, client: TestClient) -> None:
        cat_id = uuid.uuid4()
        with patch(
            f"{_SERVICE}.update_category",
            AsyncMock(side_effect=spending_category_service.SpendingCategoryConflictError("dup")),
        ):
            res = client.patch(f"/spending-categories/{cat_id}", json={"name": "Food & Dining"})
        assert res.status_code == 409


class TestArchive:
    def test_archive_returns_200(self, client: TestClient) -> None:
        cat_id = uuid.uuid4()
        with patch(f"{_SERVICE}.archive_category", AsyncMock(return_value=_response("Food & Dining", archived=True))):
            res = client.post(f"/spending-categories/{cat_id}/archive")
        assert res.status_code == 200
        assert res.json()["archived_at"] is not None

    def test_cannot_archive_default_is_409(self, client: TestClient) -> None:
        cat_id = uuid.uuid4()
        with patch(
            f"{_SERVICE}.archive_category",
            AsyncMock(side_effect=spending_category_service.SpendingCategoryDefaultArchiveError("default")),
        ):
            res = client.post(f"/spending-categories/{cat_id}/archive")
        assert res.status_code == 409

    def test_unarchive_returns_200(self, client: TestClient) -> None:
        cat_id = uuid.uuid4()
        with patch(f"{_SERVICE}.unarchive_category", AsyncMock(return_value=_response("Food & Dining"))):
            res = client.post(f"/spending-categories/{cat_id}/unarchive")
        assert res.status_code == 200
        assert res.json()["archived_at"] is None
