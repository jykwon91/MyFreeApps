"""Inline-JD fallback on the application detail view (#6 regression fix).

When the operator attaches the JD as a ``job_description`` document instead of
typing it into the application, ``application.jd_text`` is empty and the inline
JD block (OverviewSection) renders nothing — the only way to read the JD was to
open the document and click Edit. ``GET /applications/{id}`` now falls back to
the latest ``job_description`` document body so the read view shows the JD. The
column stays the source of truth when it is set.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DocumentKind
from app.models.application.document import Document
from app.models.company.company import Company


async def _company(db: AsyncSession, user_id: uuid.UUID, name: str = "Acme") -> Company:
    company = Company(
        user_id=user_id,
        name=name,
        primary_domain=f"{name.lower().replace(' ', '-')}.example.com",
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


def _payload(company_id: uuid.UUID, **overrides: object) -> dict:
    base = {
        "company_id": str(company_id),
        "role_title": "Senior Software Engineer, Full-Stack",
        "source": "linkedin",
        "remote_type": "remote",
    }
    base.update(overrides)
    return base


async def _add_document(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
    *,
    kind: str,
    body: str | None,
    title: str = "doc",
    when: datetime | None = None,
) -> Document:
    doc = Document(
        user_id=user_id,
        application_id=application_id,
        title=title,
        kind=kind,
        body=body,
    )
    if when is not None:
        doc.created_at = when
        doc.updated_at = when
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@pytest.mark.asyncio
async def test_jd_falls_back_to_job_description_document_body(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    company = await _company(db, user_id)

    async with await as_user(user) as authed:
        create = await authed.post("/applications", json=_payload(company.id))
        assert create.status_code == 201, create.text
        app_id = create.json()["id"]

        jd = "We are hiring a Full-Stack Engineer. Python + React required."
        await _add_document(
            db, user_id, uuid.UUID(app_id),
            kind=DocumentKind.JOB_DESCRIPTION, body=jd,
        )

        resp = await authed.get(f"/applications/{app_id}")

    assert resp.status_code == 200, resp.text
    assert resp.json()["jd_text"] == jd


@pytest.mark.asyncio
async def test_application_jd_text_wins_over_document(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    company = await _company(db, user_id)

    typed = "Typed JD on the application itself."
    async with await as_user(user) as authed:
        create = await authed.post(
            "/applications", json=_payload(company.id, jd_text=typed),
        )
        assert create.status_code == 201, create.text
        app_id = create.json()["id"]

        await _add_document(
            db, user_id, uuid.UUID(app_id),
            kind=DocumentKind.JOB_DESCRIPTION, body="Different document body.",
        )

        resp = await authed.get(f"/applications/{app_id}")

    assert resp.status_code == 200, resp.text
    # The column is authoritative when set — the document must not override it.
    assert resp.json()["jd_text"] == typed


@pytest.mark.asyncio
async def test_non_job_description_document_is_not_used(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    company = await _company(db, user_id)

    async with await as_user(user) as authed:
        create = await authed.post("/applications", json=_payload(company.id))
        assert create.status_code == 201, create.text
        app_id = create.json()["id"]

        await _add_document(
            db, user_id, uuid.UUID(app_id),
            kind=DocumentKind.COVER_LETTER, body="Dear hiring manager...",
        )

        resp = await authed.get(f"/applications/{app_id}")

    assert resp.status_code == 200, resp.text
    assert resp.json()["jd_text"] is None


@pytest.mark.asyncio
async def test_latest_job_description_document_wins(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    company = await _company(db, user_id)

    async with await as_user(user) as authed:
        create = await authed.post("/applications", json=_payload(company.id))
        assert create.status_code == 201, create.text
        app_id = create.json()["id"]

        await _add_document(
            db, user_id, uuid.UUID(app_id),
            kind=DocumentKind.JOB_DESCRIPTION, body="Older JD.", title="old",
            when=datetime(2020, 1, 1, tzinfo=timezone.utc),
        )
        await _add_document(
            db, user_id, uuid.UUID(app_id),
            kind=DocumentKind.JOB_DESCRIPTION, body="Newer JD.", title="new",
            when=datetime(2024, 1, 1, tzinfo=timezone.utc),
        )

        resp = await authed.get(f"/applications/{app_id}")

    assert resp.status_code == 200, resp.text
    assert resp.json()["jd_text"] == "Newer JD."
