"""HTTP route tests for /reply-templates and /inquiries/{id}/render-template."""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.inquiries.rendered_template_response import RenderedTemplateResponse
from app.schemas.inquiries.reply_template_response import ReplyTemplateResponse


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id, user_id=user_id, org_role=OrgRole.OWNER,
    )


def _build_template(
    *, org_id: uuid.UUID, user_id: uuid.UUID, template_id: uuid.UUID,
    name: str = "Initial reply",
) -> ReplyTemplateResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return ReplyTemplateResponse(
        id=template_id,
        organization_id=org_id,
        user_id=user_id,
        name=name,
        subject_template="Re: $listing",
        body_template="Hi $name",
        is_archived=False,
        display_order=0,
        created_at=now,
        updated_at=now,
    )


class TestListReplyTemplates:
    @pytest.mark.asyncio
    async def test_returns_seeded_list(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        tpl = _build_template(
            org_id=org_id, user_id=user_id, template_id=uuid.uuid4(),
        )
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.reply_templates.reply_template_service.list_templates",
            return_value=[tpl],
        ):
            with TestClient(app) as client:
                r = client.get("/reply-templates")
                assert r.status_code == 200
                body = r.json()
                assert len(body) == 1
                assert body[0]["name"] == "Initial reply"
        app.dependency_overrides.clear()


class TestCreateReplyTemplate:
    @pytest.mark.asyncio
    async def test_creates_via_service(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        tpl = _build_template(
            org_id=org_id, user_id=user_id, template_id=uuid.uuid4(),
            name="Custom",
        )
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.reply_templates.reply_template_service.create_template",
            return_value=tpl,
        ):
            with TestClient(app) as client:
                r = client.post(
                    "/reply-templates",
                    json={
                        "name": "Custom",
                        "subject_template": "s",
                        "body_template": "b",
                    },
                )
                assert r.status_code == 201
                assert r.json()["name"] == "Custom"
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_extra_fields_rejected(self) -> None:
        """Pydantic should reject unexpected keys (forbids tenant injection)."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with TestClient(app) as client:
            r = client.post(
                "/reply-templates",
                json={
                    "name": "x",
                    "subject_template": "s",
                    "body_template": "b",
                    "user_id": str(uuid.uuid4()),  # extra — must be rejected
                },
            )
            assert r.status_code == 422
        app.dependency_overrides.clear()


class TestUpdateReplyTemplate:
    @pytest.mark.asyncio
    async def test_404_when_missing(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.reply_templates.reply_template_service.update_template",
            side_effect=LookupError("not found"),
        ):
            with TestClient(app) as client:
                r = client.patch(
                    f"/reply-templates/{template_id}",
                    json={"name": "new"},
                )
                assert r.status_code == 404
        app.dependency_overrides.clear()


class TestArchiveReplyTemplate:
    @pytest.mark.asyncio
    async def test_archives_returns_204(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.reply_templates.reply_template_service.archive_template",
            return_value=None,
        ):
            with TestClient(app) as client:
                r = client.delete(f"/reply-templates/{template_id}")
                assert r.status_code == 204
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_404_when_missing(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        template_id = uuid.uuid4()
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.reply_templates.reply_template_service.archive_template",
            side_effect=LookupError("not found"),
        ):
            with TestClient(app) as client:
                r = client.delete(f"/reply-templates/{template_id}")
                assert r.status_code == 404
        app.dependency_overrides.clear()


class TestRenderTemplate:
    @pytest.mark.asyncio
    async def test_returns_rendered_subject_and_body(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id, template_id = uuid.uuid4(), uuid.uuid4()
        rendered = RenderedTemplateResponse(
            subject="Re: Cozy Room",
            body="Hi Alice",
        )
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.reply_template_service.render_for_inquiry",
            return_value=rendered,
        ):
            with TestClient(app) as client:
                r = client.get(
                    f"/inquiries/{inquiry_id}/render-template/{template_id}",
                )
                assert r.status_code == 200
                assert r.json() == {"subject": "Re: Cozy Room", "body": "Hi Alice"}
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_404_when_inquiry_or_template_missing(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        inquiry_id, template_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        with patch(
            "app.api.inquiries.reply_template_service.render_for_inquiry",
            side_effect=LookupError("not found"),
        ):
            with TestClient(app) as client:
                r = client.get(
                    f"/inquiries/{inquiry_id}/render-template/{template_id}",
                )
                assert r.status_code == 404
        app.dependency_overrides.clear()
