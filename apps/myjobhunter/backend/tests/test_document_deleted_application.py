"""A document linked to a soft-deleted application reads back with no link.

Applications are soft-deleted and kept for audit and restore, so a linked
document keeps its stored ``application_id``. Documents used to send that link
out, and the "Application" link opened "Can't find it". Every document read now
reports the link only while the application is live: the stored column is never
touched, so a restored application gets its documents back.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.document import Document
from app.models.company.company import Company


async def _application(db: AsyncSession, user_id: uuid.UUID) -> Application:
    company = Company(user_id=user_id, name="Acme", primary_domain=f"acme-{uuid.uuid4().hex[:8]}.example.com")
    db.add(company)
    await db.flush()
    application = Application(user_id=user_id, company_id=company.id, role_title="Engineer")
    db.add(application)
    await db.commit()
    return application


async def _document(a: AsyncClient, application_id: uuid.UUID | None, title: str) -> dict[str, Any]:
    payload: dict[str, Any] = {"title": title, "kind": "cover_letter", "body": "Dear team"}
    if application_id is not None:
        payload["application_id"] = str(application_id)
    resp = await a.post("/documents", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _listed(a: AsyncClient, **params: str) -> dict[str, str | None]:
    resp = await a.get("/documents", params=params)
    assert resp.status_code == 200, resp.text
    return {item["title"]: item["application_id"] for item in resp.json()["items"]}


async def _set_deleted(db: AsyncSession, application: Application, deleted: bool) -> None:
    await db.refresh(application)
    application.deleted_at = datetime.now(timezone.utc) if deleted else None
    await db.commit()


async def _stored_link(db: AsyncSession, document_id: str) -> uuid.UUID | None:
    row = await db.get(Document, uuid.UUID(document_id))
    assert row is not None
    await db.refresh(row)
    return row.application_id


@pytest.mark.asyncio
async def test_documents_of_a_deleted_application_read_back_with_no_link(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    deleted = await _application(db, user_id)
    kept = await _application(db, user_id)
    async with await as_user(user) as a:
        letter = await _document(a, deleted.id, "Letter")
        await _document(a, kept.id, "Other letter")
        await _document(a, None, "Unlinked")

        assert (await a.delete(f"/applications/{deleted.id}")).status_code == 204
        listed = await _listed(a)
        detail = (await a.get(f"/documents/{letter['id']}")).json()
        patched = await a.patch(f"/documents/{letter['id']}", json={"title": "Letter v2"})

    assert listed == {"Letter": None, "Other letter": str(kept.id), "Unlinked": None}
    assert detail["application_id"] is None
    assert patched.status_code == 200, patched.text
    assert patched.json()["application_id"] is None
    # The association itself is kept, for audit and restore.
    assert await _stored_link(db, letter["id"]) == deleted.id


@pytest.mark.asyncio
async def test_filtering_by_a_deleted_application_lists_nothing(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    application = await _application(db, uuid.UUID(user["id"]))
    async with await as_user(user) as a:
        await _document(a, application.id, "Letter")
        assert await _listed(a, application_id=str(application.id)) == {"Letter": str(application.id)}

        assert (await a.delete(f"/applications/{application.id}")).status_code == 204
        resp = await a.get("/documents", params={"application_id": str(application.id)})

    assert resp.status_code == 200, resp.text
    assert resp.json()["items"] == []
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_the_link_comes_back_when_the_application_is_restored(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
) -> None:
    user = await user_factory()
    application = await _application(db, uuid.UUID(user["id"]))
    async with await as_user(user) as a:
        letter = await _document(a, application.id, "Letter")
        await _set_deleted(db, application, True)
        assert (await a.get(f"/documents/{letter['id']}")).json()["application_id"] is None

        await _set_deleted(db, application, False)
        restored = (await a.get(f"/documents/{letter['id']}")).json()

    assert restored["application_id"] == str(application.id)


@pytest.mark.asyncio
async def test_other_users_documents_are_unaffected(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
) -> None:
    owner = await user_factory()
    other = await user_factory()
    owners_app = await _application(db, uuid.UUID(owner["id"]))
    others_app = await _application(db, uuid.UUID(other["id"]))
    async with await as_user(owner) as a:
        owners_letter = await _document(a, owners_app.id, "Owner's letter")
    async with await as_user(other) as b:
        await _document(b, others_app.id, "Other's letter")
        # Someone else can't delete the owner's application, so its link stays.
        assert (await b.delete(f"/applications/{owners_app.id}")).status_code == 404
    async with await as_user(owner) as a:
        assert (await a.get(f"/documents/{owners_letter['id']}")).json()["application_id"] == str(owners_app.id)
        assert (await a.delete(f"/applications/{owners_app.id}")).status_code == 204
    async with await as_user(other) as b:
        others_listed = await _listed(b)

    assert others_listed == {"Other's letter": str(others_app.id)}
