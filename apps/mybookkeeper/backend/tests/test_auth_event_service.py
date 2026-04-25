"""Unit tests for auth_event_service.log_auth_event."""
import uuid
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_events import AuthEventType
from app.models.system.auth_event import AuthEvent
from app.services.system.auth_event_service import log_auth_event


def _make_request(
    ip: str = "1.2.3.4",
    user_agent: str = "TestAgent/1.0",
    forwarded_for: str | None = None,
) -> MagicMock:
    request = MagicMock()
    headers: dict[str, str] = {"user-agent": user_agent}
    if forwarded_for:
        headers["x-forwarded-for"] = forwarded_for
    request.headers = headers
    request.client = MagicMock()
    request.client.host = ip
    return request


@pytest.mark.anyio
async def test_log_auth_event_writes_row(db: AsyncSession) -> None:
    user_id = uuid.uuid4()
    request = _make_request(ip="10.0.0.1", user_agent="Mozilla/5.0")

    await log_auth_event(
        db,
        event_type=AuthEventType.LOGIN_SUCCESS,
        user_id=user_id,
        request=request,
        succeeded=True,
        metadata={"extra": "data"},
    )
    await db.flush()

    result = (await db.execute(select(AuthEvent))).scalars().all()
    assert len(result) == 1
    ev = result[0]
    assert ev.user_id == user_id
    assert ev.event_type == AuthEventType.LOGIN_SUCCESS
    assert ev.ip_address == "10.0.0.1"
    assert ev.user_agent == "Mozilla/5.0"
    assert ev.succeeded is True
    assert ev.event_metadata == {"extra": "data"}


@pytest.mark.anyio
async def test_log_auth_event_handles_no_request(db: AsyncSession) -> None:
    user_id = uuid.uuid4()

    await log_auth_event(
        db,
        event_type=AuthEventType.LOGIN_FAILURE,
        user_id=user_id,
        request=None,
        succeeded=False,
    )
    await db.flush()

    ev = (await db.execute(select(AuthEvent))).scalars().one()
    assert ev.ip_address is None
    assert ev.user_agent is None
    assert ev.succeeded is False


@pytest.mark.anyio
async def test_log_auth_event_truncates_long_user_agent(db: AsyncSession) -> None:
    long_ua = "A" * 600  # exceeds 500-char limit

    await log_auth_event(
        db,
        event_type=AuthEventType.REGISTER_SUCCESS,
        user_id=uuid.uuid4(),
        request=_make_request(user_agent=long_ua),
        succeeded=True,
    )
    await db.flush()

    ev = (await db.execute(select(AuthEvent))).scalars().one()
    assert ev.user_agent is not None
    assert len(ev.user_agent) == 500
    assert ev.user_agent == "A" * 500


@pytest.mark.anyio
async def test_log_auth_event_extracts_real_ip_from_forwarded_for(db: AsyncSession) -> None:
    request = _make_request(
        ip="172.16.0.1",  # proxy IP
        forwarded_for="203.0.113.5, 10.0.0.1",  # client, then proxy
    )

    await log_auth_event(
        db,
        event_type=AuthEventType.LOGIN_SUCCESS,
        user_id=uuid.uuid4(),
        request=request,
        succeeded=True,
    )
    await db.flush()

    ev = (await db.execute(select(AuthEvent))).scalars().one()
    assert ev.ip_address == "203.0.113.5"


@pytest.mark.anyio
async def test_log_auth_event_no_user_id(db: AsyncSession) -> None:
    """Events for unknown-user attempts are allowed with user_id=None."""
    await log_auth_event(
        db,
        event_type=AuthEventType.LOGIN_FAILURE,
        user_id=None,
        succeeded=False,
        metadata={"email_domain": "example.com", "reason": "unknown_email"},
    )
    await db.flush()

    ev = (await db.execute(select(AuthEvent))).scalars().one()
    assert ev.user_id is None
    assert ev.event_metadata["email_domain"] == "example.com"
