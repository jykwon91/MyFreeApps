"""Quota service against the real daily_usage_counters table: reserve order,
rollback of a refused reservation, reconcile (release / overage), refund."""
from __future__ import annotations

import uuid

import pytest

from app.core.config import settings
from app.db.session import unit_of_work
from app.services.tutor import quota_service
from platform_shared.repositories.daily_quota_repo import get_daily_usage


async def _usage(bucket: str) -> int:
    async with unit_of_work() as db:
        return await get_daily_usage(db, bucket=bucket)


@pytest.mark.asyncio
async def test_reserve_charges_both_buckets(fake_claude) -> None:
    user_id = uuid.uuid4()
    async with unit_of_work() as db:
        reservation = await quota_service.reserve(db, user_id=user_id, units=1000)
    assert reservation.units == 1000
    assert await _usage(quota_service.user_bucket(user_id)) == 1000
    assert await _usage(quota_service.GLOBAL_BUCKET) == 1000


@pytest.mark.asyncio
async def test_user_cap_refuses(fake_claude, monkeypatch) -> None:
    monkeypatch.setattr(settings, "ltutor_user_daily_units", 500)
    with pytest.raises(quota_service.DailyLimitReachedError):
        async with unit_of_work() as db:
            await quota_service.reserve(db, user_id=uuid.uuid4(), units=501)
    assert await _usage(quota_service.GLOBAL_BUCKET) == 0


@pytest.mark.asyncio
async def test_refused_global_rolls_back_the_user_reservation(fake_claude, monkeypatch) -> None:
    monkeypatch.setattr(settings, "ltutor_global_daily_units", 500)
    user_id = uuid.uuid4()
    with pytest.raises(quota_service.TutorUnavailableError):
        async with unit_of_work() as db:
            await quota_service.reserve(db, user_id=user_id, units=501)
    assert await _usage(quota_service.user_bucket(user_id)) == 0


@pytest.mark.asyncio
async def test_kill_switch(fake_claude, monkeypatch) -> None:
    monkeypatch.setattr(settings, "ltutor_global_daily_units", 0)
    assert quota_service.tutor_enabled() is False
    with pytest.raises(quota_service.TutorUnavailableError):
        async with unit_of_work() as db:
            await quota_service.reserve(db, user_id=uuid.uuid4(), units=1)


@pytest.mark.asyncio
async def test_reconcile_releases_the_unused_part(fake_claude) -> None:
    user_id = uuid.uuid4()
    async with unit_of_work() as db:
        reservation = await quota_service.reserve(db, user_id=user_id, units=1000)
    async with unit_of_work() as db:
        await quota_service.reconcile(db, reservation, actual_units=300)
    assert await _usage(quota_service.user_bucket(user_id)) == 300
    assert await _usage(quota_service.GLOBAL_BUCKET) == 300


@pytest.mark.asyncio
async def test_reconcile_charges_an_overage(fake_claude) -> None:
    user_id = uuid.uuid4()
    async with unit_of_work() as db:
        reservation = await quota_service.reserve(db, user_id=user_id, units=1000)
    async with unit_of_work() as db:
        await quota_service.reconcile(db, reservation, actual_units=1200)
    assert await _usage(quota_service.user_bucket(user_id)) == 1200


@pytest.mark.asyncio
async def test_refund_returns_everything(fake_claude) -> None:
    user_id = uuid.uuid4()
    async with unit_of_work() as db:
        reservation = await quota_service.reserve(db, user_id=user_id, units=1000)
    async with unit_of_work() as db:
        await quota_service.refund(db, reservation)
    assert await _usage(quota_service.user_bucket(user_id)) == 0
    assert await _usage(quota_service.GLOBAL_BUCKET) == 0


@pytest.mark.asyncio
async def test_remaining_fraction_and_can_afford(fake_claude, monkeypatch) -> None:
    monkeypatch.setattr(settings, "ltutor_user_daily_units", 1000)
    user_id = uuid.uuid4()
    async with unit_of_work() as db:
        await quota_service.reserve(db, user_id=user_id, units=750)
    async with unit_of_work() as db:
        assert await quota_service.remaining_fraction(db, user_id) == pytest.approx(0.25)
        assert await quota_service.can_afford(db, user_id, units=250) is True
        assert await quota_service.can_afford(db, user_id, units=251) is False
