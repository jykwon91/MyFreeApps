"""``discovery_repository.upsert_postings`` new-vs-updated accounting.

The counts end up in the refresh response (``new_count`` / ``updated_count``),
in ``discovery_fetches`` and in the fetch log. A row is "new" when its
``created_at`` equals its ``updated_at``; the two used to come from two
separate ``datetime.now()`` calls, so roughly one fresh posting in five was
miscounted as an update. Many rows per call make that miss certain to show.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.discovery.discovery_source import DiscoverySource
from app.repositories.discovery import discovery_repository

_BATCH = 60


def _posting(external_id: str) -> dict[str, Any]:
    return {
        "source": "jsearch",
        "source_external_id": external_id,
        "title": "Backend Engineer",
        "company_name": "Acme",
        "raw_payload": {},
    }


async def _make_source(db: AsyncSession, user_id: uuid.UUID) -> DiscoverySource:
    src = DiscoverySource(user_id=user_id, source="jsearch", config={})
    db.add(src)
    await db.flush()
    return src


async def _make_fetch(db: AsyncSession, src: DiscoverySource) -> DiscoveryFetch:
    fetch = DiscoveryFetch(
        user_id=src.user_id,
        discovery_source_id=src.id,
        source="jsearch",
        started_at=datetime.now(timezone.utc),
    )
    db.add(fetch)
    await db.flush()
    return fetch


@pytest.mark.asyncio
async def test_fresh_postings_all_count_as_new(db: AsyncSession, user_factory) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    fetch = await _make_fetch(db, await _make_source(db, user_id))

    new, updated = await discovery_repository.upsert_postings(
        db,
        user_id=user_id,
        fetch_id=fetch.id,
        postings=[_posting(f"ext-{i}") for i in range(_BATCH)],
    )

    assert (new, updated) == (_BATCH, 0)


@pytest.mark.asyncio
async def test_refetched_postings_all_count_as_updated(
    db: AsyncSession, user_factory,
) -> None:
    user_id = uuid.UUID((await user_factory())["id"])
    src = await _make_source(db, user_id)
    first = await _make_fetch(db, src)
    postings = [_posting(f"ext-{i}") for i in range(_BATCH)]
    await discovery_repository.upsert_postings(
        db, user_id=user_id, fetch_id=first.id, postings=postings,
    )
    second = await _make_fetch(db, src)

    new, updated = await discovery_repository.upsert_postings(
        db,
        user_id=user_id,
        fetch_id=second.id,
        postings=[*postings, _posting("ext-brand-new")],
    )

    assert (new, updated) == (1, _BATCH)
