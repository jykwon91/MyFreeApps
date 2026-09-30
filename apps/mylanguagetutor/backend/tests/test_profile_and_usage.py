"""GET/PUT /profile (onboarding) and GET /usage/today (the learner's own budget)."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.services.tutor import quota_service
from app.services.tutor.turn_service import minimum_turn_units


class TestProfile:
    @pytest.mark.asyncio
    async def test_null_before_onboarding(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/profile")
        assert resp.status_code == 200
        assert resp.json() is None

    @pytest.mark.asyncio
    async def test_put_then_get_then_update(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            saved = await authed.put("/profile", json={"language_code": "es", "level": "beginner"})
            assert saved.status_code == 200, saved.text
            assert saved.json()["level"] == "beginner"
            updated = await authed.put(
                "/profile", json={"language_code": "es", "level": "conversational"},
            )
            assert updated.status_code == 200
            got = (await authed.get("/profile")).json()
        assert got["language_code"] == "es"
        assert got["level"] == "conversational"

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "body",
        [
            {"language_code": "fr", "level": "beginner"},
            {"language_code": "es", "level": "expert"},
            {"language_code": "es"},
        ],
    )
    async def test_rejects_unknown_values(self, user_factory, as_user, body: dict[str, str]) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.put("/profile", json=body)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_profiles_are_per_user(self, user_factory, as_user) -> None:
        first = await user_factory()
        second = await user_factory()
        async with await as_user(first) as authed:
            await authed.put("/profile", json={"language_code": "es", "level": "some_phrases"})
        async with await as_user(second) as authed:
            assert (await authed.get("/profile")).json() is None

    @pytest.mark.asyncio
    async def test_profile_is_in_the_export(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            await authed.put("/profile", json={"language_code": "es", "level": "beginner"})
            export = (await authed.get("/users/me/export")).json()
        assert export["tutor_profile"] == {"language_code": "es", "level": "beginner"}

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient) -> None:
        assert (await client.get("/profile")).status_code == 401


async def _consume(bucket: str, units: int) -> None:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO daily_usage_counters (bucket, day, count, updated_at) "
                    "VALUES (:b, (now() AT TIME ZONE 'utc')::date, :n, now())"
                ),
                {"b": bucket, "n": units},
            )
    finally:
        await engine.dispose()


class TestUsageToday:
    @pytest.mark.asyncio
    async def test_fresh_user_has_full_budget(self, user_factory, as_user, fake_claude) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/usage/today")
        assert resp.status_code == 200
        assert resp.json() == {"remaining_fraction": 1.0, "cap_reached": False, "tutor_available": True}

    @pytest.mark.asyncio
    async def test_never_leaks_global_numbers(self, user_factory, as_user, fake_claude) -> None:
        await _consume(quota_service.GLOBAL_BUCKET, 123_456)
        user = await user_factory()
        async with await as_user(user) as authed:
            body = (await authed.get("/usage/today")).json()
        assert set(body) == {"remaining_fraction", "cap_reached", "tutor_available"}
        assert body["remaining_fraction"] == 1.0

    @pytest.mark.asyncio
    async def test_cap_reached_when_a_turn_no_longer_fits(
        self, user_factory, as_user, fake_claude,
    ) -> None:
        user = await user_factory()
        cap = settings.ltutor_user_daily_units
        await _consume(
            quota_service.user_bucket(uuid.UUID(user["id"])), cap - minimum_turn_units() + 1,
        )
        async with await as_user(user) as authed:
            body = (await authed.get("/usage/today")).json()
        assert body["cap_reached"] is True
        assert 0.0 < body["remaining_fraction"] < 0.2

    @pytest.mark.asyncio
    async def test_kill_switch_reports_unavailable(
        self, user_factory, as_user, fake_claude, monkeypatch,
    ) -> None:
        monkeypatch.setattr(settings, "ltutor_global_daily_units", 0)
        user = await user_factory()
        async with await as_user(user) as authed:
            body = (await authed.get("/usage/today")).json()
        assert body["tutor_available"] is False

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient) -> None:
        assert (await client.get("/usage/today")).status_code == 401
