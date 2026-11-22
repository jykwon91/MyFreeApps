"""AI routes don't hold a database connection while Claude answers.

Looking up the signed-in user leaves a transaction open on the request's
session. These routes write only through short transactions of their own, so
that one would sit idle, pinning a pooled connection, for the whole Claude
call (up to minutes under retries). A handful of users waiting on Claude could
then use up the pool.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import httpx2
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import engine as app_engine
from app.services.extraction import claude_service

_JD = (
    "Senior Backend Engineer at Acme. Python, Postgres, Kubernetes. "
    "Remote in the US. $180k-$220k per year."
)
_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


@pytest.mark.parametrize("path", ["/jobs/analyze", "/applications/parse-jd"])
@pytest.mark.asyncio
async def test_no_transaction_or_connection_is_held_during_the_claude_call(
    path: str, db: AsyncSession, user_factory, as_user,
) -> None:
    seen: list[tuple[bool, int]] = []

    async def _create(**_: object) -> None:
        seen.append((db.in_transaction(), app_engine.pool.checkedout()))
        response = httpx2.Response(401, request=_REQUEST)
        body = {"type": "error", "error": {"type": "authentication_error", "message": "x"}}
        raise anthropic.AuthenticationError("x", response=response, body=body)

    client = MagicMock()
    client.messages.create = AsyncMock(side_effect=_create)
    user = await user_factory()
    with patch.object(claude_service, "_get_client", return_value=client):
        async with await as_user(user) as authed:
            resp = await authed.post(path, json={"jd_text": _JD})

    assert resp.status_code == 502, resp.text
    assert seen == [(False, 0)]
