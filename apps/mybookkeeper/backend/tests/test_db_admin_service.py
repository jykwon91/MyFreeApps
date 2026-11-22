"""Tests for the admin-db service and the routes that delegate to it.

The service owns the session (plain session for read-only queries,
``unit_of_work`` for bulk writes) and the ``ADMIN_DB`` audit log lines; the
routes keep the API-key gate and map ValueError to 400. The repo's raw SQL is
Postgres-specific, so these tests stub the repository functions.
"""
from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.security import admin_api_key_matches
from app.main import app
from app.schemas.system.db_admin import (
    BulkPropertyReassignRequest,
    BulkSoftDeleteRequest,
    BulkSubCategoryFixRequest,
    BulkUpdateResponse,
    DbQueryResponse,
    ReExtractDocumentsRequest,
)
from app.services.system import db_admin_service

_API_KEY = "test-admin-key"


@pytest.fixture
def sessions(monkeypatch: pytest.MonkeyPatch) -> dict[str, MagicMock]:
    """Route the service's read session and unit_of_work to distinct fakes."""
    read_session = MagicMock(name="read_session")
    write_session = MagicMock(name="write_session")

    @asynccontextmanager
    async def _read():
        yield read_session

    @asynccontextmanager
    async def _uow():
        yield write_session

    monkeypatch.setattr(db_admin_service, "AsyncSessionLocal", _read)
    monkeypatch.setattr(db_admin_service, "unit_of_work", _uow)
    return {"read": read_session, "write": write_session}


class TestDbAdminService:
    @pytest.mark.asyncio
    async def test_readonly_query_uses_read_session(self, sessions) -> None:
        with patch.object(
            db_admin_service.db_admin_repo, "execute_readonly_query",
            new=AsyncMock(return_value=(["id"], [[1], [2]])),
        ) as repo:
            result = await db_admin_service.run_readonly_query("SELECT id FROM t")

        repo.assert_awaited_once_with(sessions["read"], "SELECT id FROM t")
        assert result == DbQueryResponse(columns=["id"], rows=[[1], [2]], row_count=2)

    @pytest.mark.asyncio
    async def test_readonly_query_propagates_value_error(self, sessions) -> None:
        with patch.object(
            db_admin_service.db_admin_repo, "execute_readonly_query",
            new=AsyncMock(side_effect=ValueError("Only SELECT queries are allowed")),
        ):
            with pytest.raises(ValueError):
                await db_admin_service.run_readonly_query("DROP TABLE t")

    @pytest.mark.asyncio
    async def test_reassign_property_writes_in_unit_of_work_and_logs(
        self, sessions, caplog,
    ) -> None:
        org_id, prop_id = uuid.uuid4(), uuid.uuid4()
        body = BulkPropertyReassignRequest(
            organization_id=org_id, vendor="ACME",
            filename_pattern="%inv%", target_property_id=prop_id,
        )
        with (
            patch.object(
                db_admin_service.db_admin_repo, "bulk_update_property",
                new=AsyncMock(return_value=3),
            ) as repo,
            caplog.at_level(logging.INFO, logger="app.services.system.db_admin_service"),
        ):
            result = await db_admin_service.reassign_property(body)

        repo.assert_awaited_once_with(
            sessions["write"], str(org_id), "ACME", "%inv%", str(prop_id),
        )
        assert result == BulkUpdateResponse(updated=3)
        assert f"ADMIN_DB reassign_property org={org_id} target={prop_id} count=3" in caplog.text
        # Payee and file-name patterns stay out of the log, which reaches Sentry.
        assert "ACME" not in caplog.text and "%inv%" not in caplog.text

    @pytest.mark.asyncio
    async def test_fix_sub_category(self, sessions, caplog) -> None:
        org_id = uuid.uuid4()
        body = BulkSubCategoryFixRequest(
            organization_id=org_id, vendor="City Water",
            description_pattern="%water%", new_sub_category="water",
        )
        with (
            patch.object(
                db_admin_service.db_admin_repo, "bulk_update_sub_category",
                new=AsyncMock(return_value=2),
            ) as repo,
            caplog.at_level(logging.INFO, logger="app.services.system.db_admin_service"),
        ):
            result = await db_admin_service.fix_sub_category(body)

        repo.assert_awaited_once_with(
            sessions["write"], str(org_id), "City Water", "%water%", "water",
        )
        assert result.updated == 2
        assert f"ADMIN_DB fix_sub_category org={org_id} sub_cat=water count=2" in caplog.text
        assert "City Water" not in caplog.text and "%water%" not in caplog.text

    @pytest.mark.asyncio
    async def test_soft_delete_transactions(self, sessions, caplog) -> None:
        org_id = uuid.uuid4()
        body = BulkSoftDeleteRequest(organization_id=org_id, vendor="ACME", category="utilities")
        with (
            patch.object(
                db_admin_service.db_admin_repo, "bulk_soft_delete",
                new=AsyncMock(return_value=4),
            ) as repo,
            caplog.at_level(logging.INFO, logger="app.services.system.db_admin_service"),
        ):
            result = await db_admin_service.soft_delete_transactions(body)

        repo.assert_awaited_once_with(
            sessions["write"], str(org_id), "ACME", "utilities", None, None,
        )
        assert result.updated == 4
        assert f"ADMIN_DB soft_delete org={org_id} category=utilities source=None count=4" in caplog.text
        assert "ACME" not in caplog.text

    @pytest.mark.asyncio
    async def test_queue_reextraction(self, sessions) -> None:
        org_id, doc_id = uuid.uuid4(), uuid.uuid4()
        body = ReExtractDocumentsRequest(organization_id=org_id, document_ids=[doc_id])
        with patch.object(
            db_admin_service.db_admin_repo, "queue_documents_for_reextraction",
            new=AsyncMock(return_value=1),
        ) as repo:
            result = await db_admin_service.queue_reextraction(body)

        repo.assert_awaited_once_with(sessions["write"], str(org_id), [str(doc_id)])
        assert result.updated == 1


class TestDbAdminRoutes:
    @pytest.fixture(autouse=True)
    def _api_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("app.api.db_admin.settings.admin_api_key", _API_KEY)

    def test_query_maps_value_error_to_400(self) -> None:
        with patch(
            "app.api.db_admin.db_admin_service.run_readonly_query",
            new=AsyncMock(side_effect=ValueError("Only SELECT queries are allowed")),
        ):
            response = TestClient(app).post(
                "/admin/db/query", json={"sql": "DROP TABLE t"},
                headers={"X-Admin-Api-Key": _API_KEY},
            )
        assert response.status_code == 400
        assert response.json() == {"detail": "Only SELECT queries are allowed"}

    def test_query_returns_service_result(self) -> None:
        with patch(
            "app.api.db_admin.db_admin_service.run_readonly_query",
            new=AsyncMock(return_value=DbQueryResponse(columns=["n"], rows=[[1]], row_count=1)),
        ) as svc:
            response = TestClient(app).post(
                "/admin/db/query", json={"sql": "SELECT 1 AS n"},
                headers={"X-Admin-Api-Key": _API_KEY},
            )
        assert response.status_code == 200
        assert response.json() == {"columns": ["n"], "rows": [[1]], "row_count": 1}
        svc.assert_awaited_once_with("SELECT 1 AS n")

    def test_wrong_api_key_is_403(self) -> None:
        with patch(
            "app.api.db_admin.db_admin_service.run_readonly_query", new=AsyncMock(),
        ) as svc:
            response = TestClient(app).post(
                "/admin/db/query", json={"sql": "SELECT 1"},
                headers={"X-Admin-Api-Key": "wrong-key"},
            )
        assert response.status_code == 403
        svc.assert_not_awaited()

    def test_unset_key_keeps_route_disabled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("app.api.db_admin.settings.admin_api_key", "")
        with patch(
            "app.api.db_admin.db_admin_service.run_readonly_query", new=AsyncMock(),
        ) as svc:
            response = TestClient(app).post(
                "/admin/db/query", json={"sql": "SELECT 1"},
                headers={"X-Admin-Api-Key": _API_KEY},
            )
        assert response.status_code == 503
        svc.assert_not_awaited()

    def test_non_ascii_key_is_403_not_500(self) -> None:
        response = TestClient(app).post(
            "/admin/db/query", json={"sql": "SELECT 1"},
            headers={"X-Admin-Api-Key": "kéy".encode("latin-1")},
        )
        assert response.status_code == 403

    def test_query_requires_api_key(self) -> None:
        with patch(
            "app.api.db_admin.db_admin_service.run_readonly_query", new=AsyncMock(),
        ) as svc:
            response = TestClient(app).post("/admin/db/query", json={"sql": "SELECT 1"})
        assert response.status_code == 401
        svc.assert_not_awaited()

    @pytest.mark.parametrize(
        ("path", "service_fn", "payload"),
        [
            (
                "/admin/db/reassign-property", "reassign_property",
                {"vendor": "ACME", "filename_pattern": "%x%",
                 "target_property_id": str(uuid.uuid4())},
            ),
            (
                "/admin/db/fix-sub-category", "fix_sub_category",
                {"vendor": "ACME", "description_pattern": "%x%", "new_sub_category": "water"},
            ),
            ("/admin/db/soft-delete", "soft_delete_transactions", {"vendor": "ACME"}),
            ("/admin/db/re-extract", "queue_reextraction", {"document_ids": [str(uuid.uuid4())]}),
        ],
    )
    def test_bulk_routes_delegate_to_service(
        self, path: str, service_fn: str, payload: dict[str, object],
    ) -> None:
        body = {"organization_id": str(uuid.uuid4()), **payload}
        with patch(
            f"app.api.db_admin.db_admin_service.{service_fn}",
            new=AsyncMock(return_value=BulkUpdateResponse(updated=5)),
        ) as svc:
            response = TestClient(app).post(
                path, json=body, headers={"X-Admin-Api-Key": _API_KEY},
            )
        assert response.status_code == 200
        assert response.json() == {"updated": 5}
        svc.assert_awaited_once()
        assert str(svc.await_args.args[0].organization_id) == body["organization_id"]


class TestAdminApiKeyMatches:
    def test_equal_keys_match(self) -> None:
        assert admin_api_key_matches(_API_KEY, _API_KEY)

    def test_different_keys_do_not_match(self) -> None:
        assert not admin_api_key_matches("other", _API_KEY)

    def test_non_ascii_does_not_raise(self) -> None:
        assert not admin_api_key_matches("kéy", _API_KEY)
