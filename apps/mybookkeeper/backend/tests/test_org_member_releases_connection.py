"""Org routes don't keep the user lookup's transaction open while they run.

Looking up the signed-in user leaves a transaction open on the request's
session. Org routes do their reads and writes in their services' own short
transactions, so that one would sit idle, holding a pooled connection, for
the whole request: through a storage upload, an outside API call, or a wait
for a second connection.
"""
from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import permissions
from app.core.auth import current_active_user
from app.core.context import RequestContext
from app.db.session import get_db
from app.models.organization.organization import Organization
from app.models.user.user import User


@pytest.mark.asyncio
async def test_request_session_is_released_before_the_route_runs(
    db: AsyncSession, test_user: User, test_org: Organization, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        permissions, "AsyncSessionLocal", lambda: AsyncSession(bind=db.bind, expire_on_commit=False),
    )
    seen: list[bool] = []
    probe = FastAPI()

    @probe.get("/probe")
    async def _route(
        ctx: RequestContext = Depends(permissions.require_write_access),
        session: AsyncSession = Depends(get_db),
    ) -> dict[str, str]:
        seen.append(session.in_transaction())
        return {"org": str(ctx.organization_id)}

    async def _request_db() -> AsyncIterator[AsyncSession]:
        yield db

    async def _user_looked_up(session: AsyncSession = Depends(get_db)) -> User:
        # What the real lookup leaves behind: a read on the request session.
        await session.execute(text("SELECT 1"))
        return test_user

    probe.dependency_overrides[get_db] = _request_db
    probe.dependency_overrides[current_active_user] = _user_looked_up

    async with AsyncClient(transport=ASGITransport(app=probe), base_url="http://test") as client:
        resp = await client.get("/probe", headers={"X-Organization-Id": str(test_org.id)})

    assert resp.status_code == 200
    assert resp.json() == {"org": str(test_org.id)}
    assert seen == [False]
