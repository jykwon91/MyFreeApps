"""DELETE /users/me removes the user's daily quota counters, and only theirs."""
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import date, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.main import app
from app.models.user.user import User
from app.services.tutor.quota_service import GLOBAL_BUCKET, user_bucket
from platform_shared.db.models.daily_usage_counter import DailyUsageCounter
from platform_shared.repositories.daily_quota_repo import (
    try_consume_daily_quota_amount,
    utc_today,
)


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _fake_uow() -> AsyncIterator[AsyncSession]:
        yield db
        await db.flush()

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.api.account.unit_of_work", _fake_uow):
        yield
    app.dependency_overrides.clear()


async def _days_for(db: AsyncSession, bucket: str) -> int:
    rows = await db.scalars(select(DailyUsageCounter).where(DailyUsageCounter.bucket == bucket))
    return len(rows.all())


async def _spend(db: AsyncSession, bucket: str, day: date) -> None:
    assert await try_consume_daily_quota_amount(db, bucket=bucket, cap=100, amount=5, day=day)


@pytest.mark.asyncio
async def test_deleting_an_account_removes_only_that_users_counters(
    user_factory, as_user, db: AsyncSession,
) -> None:
    alice = await user_factory()
    bob = await user_factory()
    today = utc_today()
    for day in (today, today - timedelta(days=1)):
        await _spend(db, user_bucket(uuid.UUID(alice["id"])), day)
        await _spend(db, user_bucket(uuid.UUID(bob["id"])), day)
    await _spend(db, GLOBAL_BUCKET, today)

    async with await as_user(alice) as authed:
        resp = await authed.request(
            "DELETE",
            "/users/me",
            json={"password": alice["password"], "confirm_email": alice["email"]},
        )

    assert resp.status_code in (200, 204), resp.text
    assert await db.get(User, uuid.UUID(alice["id"])) is None
    assert await _days_for(db, user_bucket(uuid.UUID(alice["id"]))) == 0
    assert await _days_for(db, user_bucket(uuid.UUID(bob["id"]))) == 2
    assert await _days_for(db, GLOBAL_BUCKET) >= 1
