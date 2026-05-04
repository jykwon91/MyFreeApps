"""Tests for ``?name_search=`` filter on ``GET /companies`` (Phase 2).

Covers:
- Happy path: substring match returns matching companies.
- Case-insensitive: uppercase search matches lowercase name.
- No match: returns empty list, not 404.
- Empty string / whitespace: treated as no filter — returns all companies.
- No filter: returns all companies (regression guard).
- Tenant isolation: cannot search another user's companies.
"""
from __future__ import annotations

import pytest


class TestCompanyNameSearch:
    @pytest.mark.asyncio
    async def test_name_search_returns_matching_companies(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            await authed.post(
                "/companies",
                json={"name": "Acme Corp", "primary_domain": "acme.example.com"},
            )
            await authed.post(
                "/companies",
                json={"name": "Beta Inc", "primary_domain": "beta.example.com"},
            )

            resp = await authed.get("/companies?name_search=Acme")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Acme Corp"

    @pytest.mark.asyncio
    async def test_name_search_case_insensitive(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            await authed.post(
                "/companies",
                json={"name": "acme corp", "primary_domain": "acme-ci.example.com"},
            )

            resp = await authed.get("/companies?name_search=ACME")

        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "acme corp"

    @pytest.mark.asyncio
    async def test_name_search_substring_match(
        self, user_factory, as_user,
    ) -> None:
        """A partial name in the middle of the string is matched."""
        user = await user_factory()

        async with await as_user(user) as authed:
            await authed.post(
                "/companies",
                json={"name": "Google Inc", "primary_domain": "google.example.com"},
            )
            await authed.post(
                "/companies",
                json={"name": "Googlebot Systems", "primary_domain": "googlebot.example.com"},
            )
            await authed.post(
                "/companies",
                json={"name": "Microsoft Corp", "primary_domain": "microsoft.example.com"},
            )

            resp = await authed.get("/companies?name_search=google")

        body = resp.json()
        assert body["total"] == 2
        names = {item["name"] for item in body["items"]}
        assert names == {"Google Inc", "Googlebot Systems"}

    @pytest.mark.asyncio
    async def test_name_search_no_match_returns_empty(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()

        async with await as_user(user) as authed:
            await authed.post(
                "/companies",
                json={"name": "Acme Corp", "primary_domain": "acme-nm.example.com"},
            )

            resp = await authed.get("/companies?name_search=Nonexistent")

        body = resp.json()
        assert body["total"] == 0
        assert body["items"] == []

    @pytest.mark.asyncio
    async def test_empty_name_search_returns_all(
        self, user_factory, as_user,
    ) -> None:
        """Empty string name_search is treated as no filter."""
        user = await user_factory()

        async with await as_user(user) as authed:
            await authed.post(
                "/companies",
                json={"name": "Corp A", "primary_domain": "corp-a.example.com"},
            )
            await authed.post(
                "/companies",
                json={"name": "Corp B", "primary_domain": "corp-b.example.com"},
            )

            resp_empty = await authed.get("/companies?name_search=")
            resp_whitespace = await authed.get("/companies?name_search=   ")

        # Both should return all 2 companies.
        assert resp_empty.json()["total"] == 2
        assert resp_whitespace.json()["total"] == 2

    @pytest.mark.asyncio
    async def test_no_filter_returns_all(
        self, user_factory, as_user,
    ) -> None:
        """Regression guard: omitting name_search returns all companies."""
        user = await user_factory()

        async with await as_user(user) as authed:
            await authed.post(
                "/companies",
                json={"name": "Corp A", "primary_domain": "corp-a2.example.com"},
            )
            await authed.post(
                "/companies",
                json={"name": "Corp B", "primary_domain": "corp-b2.example.com"},
            )

            resp = await authed.get("/companies")

        assert resp.json()["total"] == 2

    @pytest.mark.asyncio
    async def test_name_search_tenant_isolation(
        self, user_factory, as_user,
    ) -> None:
        """name_search cannot return another user's companies."""
        owner = await user_factory()
        attacker = await user_factory()

        async with await as_user(owner) as owner_client:
            await owner_client.post(
                "/companies",
                json={"name": "Secret Corp", "primary_domain": "secret.example.com"},
            )

        async with await as_user(attacker) as attacker_client:
            resp = await attacker_client.get("/companies?name_search=Secret")

        body = resp.json()
        assert body["total"] == 0
        assert body["items"] == []
