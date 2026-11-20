"""Tests for the channel catalogue service and the GET /channels route.

The route must delegate to ``channel_service.list_channels`` (routes never
open sessions or call repositories); the service owns the session.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.listings.channel import Channel
from app.models.organization.organization_member import OrgRole
from app.schemas.listings.channel_response import ChannelResponse
from app.services.listings import channel_service


def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return patch("app.services.listings.channel_service.AsyncSessionLocal", _fake)


class TestListChannelsService:
    @pytest.mark.asyncio
    async def test_returns_every_channel_ordered_by_name(self, db: AsyncSession) -> None:
        db.add(Channel(id="zz-test-chan", name="ZZ Test Channel"))
        db.add(Channel(id="aa-test-chan", name="AA Test Channel", supports_ical_export=True))
        await db.commit()

        with _patch_session(db):
            result = await channel_service.list_channels()

        ids = [c.id for c in result]
        assert "aa-test-chan" in ids and "zz-test-chan" in ids
        assert ids.index("aa-test-chan") < ids.index("zz-test-chan")
        aa = next(c for c in result if c.id == "aa-test-chan")
        assert isinstance(aa, ChannelResponse)
        assert aa.supports_ical_export is True


class TestListChannelsRoute:
    def test_delegates_to_service(self) -> None:
        ctx = RequestContext(
            organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
        )
        rows = [ChannelResponse(
            id="airbnb", name="Airbnb",
            supports_ical_export=True, supports_ical_import=True,
            created_at=datetime.now(timezone.utc),
        )]
        app.dependency_overrides[current_org_member] = lambda: ctx
        try:
            with patch(
                "app.api.listings.channel_service.list_channels",
                new=AsyncMock(return_value=rows),
            ) as list_channels:
                response = TestClient(app).get("/channels")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()[0]["id"] == "airbnb"
        list_channels.assert_awaited_once_with()
