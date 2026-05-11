"""Tests for PATCH /discover/sources/{id} — config editing.

Extends the existing test_discover_patch_source.py to cover the new
``config`` + ``source_kind`` fields added in this PR.

Verifies:
- Happy path: PATCH config for jsearch source returns 200 + updated config
- Happy path: PATCH config for greenhouse source returns 200 + updated config
- Happy path: PATCH config for lever source returns 200 + updated config
- PATCH config without source_kind returns 422
- PATCH with invalid jsearch config (unknown field) returns 422
- PATCH with invalid greenhouse config (bad board_token) returns 422
- PATCH with invalid lever config (bad company_slug) returns 422
- PATCH config does not change other fields (name, interval stay the same)
- PATCH config replaces the entire JSONB blob (not a partial merge)
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient


# ===========================================================================
# Happy paths — config update per source kind
# ===========================================================================


@pytest.mark.asyncio
async def test_patch_jsearch_config_returns_200(
    client: AsyncClient, user_factory, as_user,
):
    """PATCH jsearch config with valid fields updates the saved search."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={
                "source": "jsearch",
                "config": {"roles": ["backend engineer"], "country": "us"},
            },
        )
        source_id = created.json()["id"]

        new_config = {
            "roles": ["senior engineer", "staff engineer"],
            "country": "ca",
            "date_posted": "month",
            "remote_jobs_only": True,
        }
        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={"config": new_config, "source_kind": "jsearch"},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["config"]["roles"] == ["senior engineer", "staff engineer"]
    assert body["config"]["country"] == "ca"
    assert body["config"]["remote_jobs_only"] is True


@pytest.mark.asyncio
async def test_patch_greenhouse_config_returns_200(
    client: AsyncClient, user_factory, as_user,
):
    """PATCH greenhouse config with a new board_token updates the source."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={
                "source": "greenhouse",
                "config": {"board_token": "stripe"},
            },
        )
        source_id = created.json()["id"]

        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={
                "config": {"board_token": "anthropic", "excluded_keywords": ["intern"]},
                "source_kind": "greenhouse",
            },
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["config"]["board_token"] == "anthropic"
    assert body["config"]["excluded_keywords"] == ["intern"]


@pytest.mark.asyncio
async def test_patch_lever_config_returns_200(
    client: AsyncClient, user_factory, as_user,
):
    """PATCH lever config with a new company_slug updates the source."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={
                "source": "lever",
                "config": {"company_slug": "openai"},
            },
        )
        source_id = created.json()["id"]

        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={
                "config": {"company_slug": "anthropic"},
                "source_kind": "lever",
            },
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["config"]["company_slug"] == "anthropic"


# ===========================================================================
# Config does not clobber unrelated fields
# ===========================================================================


@pytest.mark.asyncio
async def test_patch_config_preserves_name_and_interval(
    client: AsyncClient, user_factory, as_user,
):
    """Patching config leaves name and fetch_interval_minutes unchanged."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={
                "source": "greenhouse",
                "name": "Stripe jobs",
                "config": {"board_token": "stripe"},
                "fetch_interval_minutes": 720,
            },
        )
        source_id = created.json()["id"]

        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={
                "config": {"board_token": "stripe-updated"},
                "source_kind": "greenhouse",
            },
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["config"]["board_token"] == "stripe-updated"
    assert body["name"] == "Stripe jobs"
    assert body["fetch_interval_minutes"] == 720


# ===========================================================================
# Config replaces full blob (not partial merge)
# ===========================================================================


@pytest.mark.asyncio
async def test_patch_config_replaces_entire_blob(
    client: AsyncClient, user_factory, as_user,
):
    """Patching config replaces the whole JSONB — old keys not in the new
    payload are gone (as expected for a full-replacement schema)."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={
                "source": "greenhouse",
                "config": {"board_token": "stripe", "excluded_keywords": ["junior"]},
            },
        )
        source_id = created.json()["id"]

        # Patch with a config that has no excluded_keywords.
        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={
                "config": {"board_token": "stripe"},
                "source_kind": "greenhouse",
            },
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    # excluded_keywords is gone from the stored JSONB because we did a full replace.
    assert "excluded_keywords" not in body["config"] or body["config"].get("excluded_keywords") == []


# ===========================================================================
# Validation — missing source_kind when config is provided
# ===========================================================================


@pytest.mark.asyncio
async def test_patch_config_without_source_kind_returns_422(
    client: AsyncClient, user_factory, as_user,
):
    """config without source_kind is rejected with 422 (required field missing)."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "greenhouse", "config": {"board_token": "stripe"}},
        )
        source_id = created.json()["id"]

        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={"config": {"board_token": "new-token"}},
        )

    assert resp.status_code == 422


# ===========================================================================
# Validation — per-source config validation on PATCH
# ===========================================================================


@pytest.mark.asyncio
async def test_patch_jsearch_config_unknown_field_returns_422(
    client: AsyncClient, user_factory, as_user,
):
    """JSearch config with an unknown field (typo) is rejected with 422."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"roles": ["engineer"]}},
        )
        source_id = created.json()["id"]

        # Typo: min_salary_us instead of min_salary_usd
        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={
                "config": {"roles": ["engineer"], "min_salary_us": 100000},
                "source_kind": "jsearch",
            },
        )

    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_patch_greenhouse_config_bad_board_token_returns_422(
    client: AsyncClient, user_factory, as_user,
):
    """Greenhouse config with an invalid board_token returns 422."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "greenhouse", "config": {"board_token": "stripe"}},
        )
        source_id = created.json()["id"]

        # Slash in token — SSRF risk, should be rejected.
        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={
                "config": {"board_token": "stripe/../../etc/passwd"},
                "source_kind": "greenhouse",
            },
        )

    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_patch_lever_config_bad_company_slug_returns_422(
    client: AsyncClient, user_factory, as_user,
):
    """Lever config with an invalid company_slug returns 422."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "lever", "config": {"company_slug": "openai"}},
        )
        source_id = created.json()["id"]

        # Uppercase in slug should be fine (normalized), but @ is not.
        resp = await a.patch(
            f"/discover/sources/{source_id}",
            json={
                "config": {"company_slug": "open@ai"},
                "source_kind": "lever",
            },
        )

    assert resp.status_code == 422, resp.text
