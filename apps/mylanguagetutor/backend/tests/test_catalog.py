"""GET /languages and GET /scenarios -- verified users only."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


class TestLanguages:
    @pytest.mark.asyncio
    async def test_lists_spanish(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/languages")
        assert resp.status_code == 200, resp.text
        assert resp.json() == [
            {
                "code": "es",
                "display_name": "Spanish",
                "dialect_label": "Latin American",
                "stt_locale": "es-MX",
                "tts_locale": "es-MX",
            }
        ]

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient) -> None:
        assert (await client.get("/languages")).status_code == 401


class TestScenarios:
    @pytest.mark.asyncio
    async def test_lists_scenarios_in_order(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/scenarios", params={"language": "es"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert [s["slug"] for s in body][0] == "greetings"
        assert body[-1]["slug"] == "free-talk"
        assert len(body) == 9
        assert body[0]["goals"] == [
            "Greet the tutor.",
            "Give your name.",
            "Ask the tutor's name.",
        ]

    @pytest.mark.asyncio
    async def test_unknown_language_is_422(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/scenarios", params={"language": "fr"})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_language_param_required(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/scenarios")
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.get("/scenarios", params={"language": "es"})
        assert resp.status_code == 401
