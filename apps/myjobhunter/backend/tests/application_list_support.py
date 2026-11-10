"""Seeding and paging helpers shared by the ``GET /applications`` list tests."""
from __future__ import annotations

import datetime as _dt
import uuid
from dataclasses import dataclass

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company

BASE = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)


@dataclass(frozen=True)
class Seed:
    """One application to insert; ``status`` adds a single event of that type at ``BASE``."""

    role: str
    company: str = "Acme"
    applied_days: int | None = 0
    location: str | None = None
    remote_type: str = "unknown"
    fit: str | None = None
    status: str | None = None
    created_days: int = 0
    archived: bool = False


async def seed(db: AsyncSession, user_id: uuid.UUID, seeds: list[Seed]) -> list[uuid.UUID]:
    """Insert the applications (and their companies / events) directly, oldest first."""
    companies: dict[str, Company] = {}
    ids: list[uuid.UUID] = []
    for entry in seeds:
        company = companies.get(entry.company)
        if company is None:
            company = Company(user_id=user_id, name=entry.company)
            db.add(company)
            await db.flush()
            companies[entry.company] = company
        application = Application(
            user_id=user_id,
            company_id=company.id,
            role_title=entry.role,
            applied_at=None if entry.applied_days is None else BASE + _dt.timedelta(days=entry.applied_days),
            location=entry.location,
            remote_type=entry.remote_type,
            fit_score=entry.fit,
            created_at=BASE + _dt.timedelta(days=entry.created_days),
            archived=entry.archived,
        )
        db.add(application)
        await db.flush()
        if entry.status is not None:
            db.add(
                ApplicationEvent(
                    user_id=user_id,
                    application_id=application.id,
                    event_type=entry.status,
                    occurred_at=BASE,
                    source="manual",
                ),
            )
        ids.append(application.id)
    await db.flush()
    return ids


async def roles(authed: AsyncClient, query: str) -> list[str]:
    resp = await authed.get(f"/applications?{query}")
    assert resp.status_code == 200, resp.text
    return [item["role_title"] for item in resp.json()["items"]]


async def all_pages(authed: AsyncClient, query: str, page_size: int) -> tuple[list[str], list[int]]:
    """Every page's roles concatenated, and the ``total`` each page reported."""
    collected: list[str] = []
    totals: list[int] = []
    offset = 0
    while True:
        resp = await authed.get(f"/applications?{query}&limit={page_size}&offset={offset}")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        totals.append(body["total"])
        collected.extend(item["role_title"] for item in body["items"])
        offset += page_size
        if offset >= body["total"]:
            return collected, totals
