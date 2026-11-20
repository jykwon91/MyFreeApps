"""Tests for listing an inquiry's spam-assessment audit trail.

Covers ``inquiry_service.list_spam_assessments`` (org-scoped read: the parent
inquiry is loaded first and a miss raises LookupError) and the
``GET /inquiries/{id}/spam-assessments`` route, which only maps the service
result / LookupError to HTTP.

The spam-assessment model uses Postgres-only column types (ARRAY / JSONB), so
the service tests stub the repositories rather than seeding SQLite rows.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.inquiries.inquiry_spam_assessment_response import (
    InquirySpamAssessmentResponse,
)
from app.services.inquiries import inquiry_service


def _assessment(inquiry_id: uuid.UUID) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        inquiry_id=inquiry_id,
        assessment_type="honeypot",
        passed=True,
        score=None,
        flags=None,
        details_json=None,
        created_at=_dt.datetime.now(_dt.timezone.utc),
    )


@pytest.fixture
def fake_session(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    session = MagicMock(name="session")

    @asynccontextmanager
    async def _factory():
        yield session

    monkeypatch.setattr(inquiry_service, "AsyncSessionLocal", _factory)
    return session


class TestListSpamAssessmentsService:
    @pytest.mark.asyncio
    async def test_returns_assessments_for_inquiry_in_org(
        self, fake_session: MagicMock,
    ) -> None:
        org_id, inquiry_id = uuid.uuid4(), uuid.uuid4()
        rows = [_assessment(inquiry_id), _assessment(inquiry_id)]
        with (
            patch.object(
                inquiry_service.inquiry_repo, "get_by_id",
                new=AsyncMock(return_value=SimpleNamespace(id=inquiry_id)),
            ) as get_by_id,
            patch.object(
                inquiry_service.inquiry_spam_assessment_repo, "list_by_inquiry",
                new=AsyncMock(return_value=rows),
            ) as list_by_inquiry,
        ):
            result = await inquiry_service.list_spam_assessments(org_id, inquiry_id)

        get_by_id.assert_awaited_once_with(fake_session, inquiry_id, org_id)
        list_by_inquiry.assert_awaited_once_with(fake_session, inquiry_id)
        assert [r.id for r in result] == [r.id for r in rows]
        assert all(isinstance(r, InquirySpamAssessmentResponse) for r in result)

    @pytest.mark.asyncio
    async def test_cross_org_raises_lookup_error_without_reading_assessments(
        self, fake_session: MagicMock,
    ) -> None:
        with (
            patch.object(
                inquiry_service.inquiry_repo, "get_by_id",
                new=AsyncMock(return_value=None),
            ),
            patch.object(
                inquiry_service.inquiry_spam_assessment_repo, "list_by_inquiry",
                new=AsyncMock(),
            ) as list_by_inquiry,
        ):
            with pytest.raises(LookupError):
                await inquiry_service.list_spam_assessments(uuid.uuid4(), uuid.uuid4())

        list_by_inquiry.assert_not_awaited()


class TestListSpamAssessmentsRoute:
    def _ctx(self) -> RequestContext:
        return RequestContext(
            organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
        )

    def test_returns_service_result(self) -> None:
        ctx = self._ctx()
        inquiry_id = uuid.uuid4()
        rows = [InquirySpamAssessmentResponse.model_validate(_assessment(inquiry_id))]
        app.dependency_overrides[current_org_member] = lambda: ctx
        try:
            with patch(
                "app.api.inquiries.inquiry_service.list_spam_assessments",
                new=AsyncMock(return_value=rows),
            ) as svc:
                response = TestClient(app).get(f"/inquiries/{inquiry_id}/spam-assessments")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["assessment_type"] == "honeypot"
        svc.assert_awaited_once_with(ctx.organization_id, inquiry_id)

    def test_404_when_inquiry_not_in_org(self) -> None:
        app.dependency_overrides[current_org_member] = self._ctx
        try:
            with patch(
                "app.api.inquiries.inquiry_service.list_spam_assessments",
                new=AsyncMock(side_effect=LookupError("nope")),
            ):
                response = TestClient(app).get(
                    f"/inquiries/{uuid.uuid4()}/spam-assessments",
                )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 404
        assert response.json() == {"detail": "Inquiry not found"}
