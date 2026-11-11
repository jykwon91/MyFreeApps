"""Paging for ``GET /documents``.

Clients page through the list with ``limit`` / ``offset``, so these guard the
contract they rely on:

- ``total`` is the real count across pages, with the same filters and tenant
  scope as the page (it used to be the length of the page, which hid every
  document past the first 100).
- Paging is stable: rows that tie on ``updated_at`` and ``created_at`` never
  repeat or go missing between pages.
- ``limit`` / ``offset`` are validated (422 out of range).
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.document_list_constants import DEFAULT_DOCUMENT_PAGE_SIZE, MAX_DOCUMENT_PAGE_SIZE
from app.models.application.application import Application
from app.models.application.document import Document
from app.models.company.company import Company

_BASE = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)


async def _seed(
    db: AsyncSession,
    user_id: uuid.UUID,
    count: int,
    *,
    kind: str = "cover_letter",
    title_prefix: str = "Doc",
    start: int = 0,
    tied: bool = False,
    deleted: bool = False,
) -> list[uuid.UUID]:
    """Insert ``count`` text documents. ``tied`` gives them all the same timestamps."""
    ids: list[uuid.UUID] = []
    for i in range(start, start + count):
        stamp = _BASE if tied else _BASE + _dt.timedelta(minutes=i)
        doc = Document(
            id=uuid.uuid4(),
            user_id=user_id,
            title=f"{title_prefix}{i}",
            kind=kind,
            body="body",
            created_at=stamp,
            updated_at=stamp,
            deleted_at=stamp if deleted else None,
        )
        db.add(doc)
        ids.append(doc.id)
    await db.commit()
    return ids


async def _page(authed: AsyncClient, query: str) -> dict:
    resp = await authed.get(f"/documents?{query}")
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestTotalIsTheRealCount:
    @pytest.mark.asyncio
    async def test_total_counts_every_row_across_pages(self, db, user_factory, as_user) -> None:
        user = await user_factory()
        await _seed(db, uuid.UUID(user["id"]), 7)

        async with await as_user(user) as authed:
            first = await _page(authed, "limit=3")
            last = await _page(authed, "limit=3&offset=6")

        assert len(first["items"]) == 3
        assert first["total"] == 7
        assert first["has_more"] is True
        assert len(last["items"]) == 1
        assert last["total"] == 7
        assert last["has_more"] is False

    @pytest.mark.asyncio
    async def test_default_page_holds_100_but_total_is_the_whole_list(self, db, user_factory, as_user) -> None:
        """The reported bug: 120 documents showed as 100 of 100."""
        user = await user_factory()
        await _seed(db, uuid.UUID(user["id"]), DEFAULT_DOCUMENT_PAGE_SIZE + 20)

        async with await as_user(user) as authed:
            body = await _page(authed, "")

        assert len(body["items"]) == DEFAULT_DOCUMENT_PAGE_SIZE
        assert body["total"] == DEFAULT_DOCUMENT_PAGE_SIZE + 20

    @pytest.mark.asyncio
    async def test_total_follows_the_kind_filter(self, db, user_factory, as_user) -> None:
        user = await user_factory()
        uid = uuid.UUID(user["id"])
        await _seed(db, uid, 4, kind="cover_letter", title_prefix="CL")
        await _seed(db, uid, 3, kind="tailored_resume", title_prefix="RS", start=10)

        async with await as_user(user) as authed:
            body = await _page(authed, "kind=cover_letter&limit=2")

        assert body["total"] == 4
        assert [d["kind"] for d in body["items"]] == ["cover_letter", "cover_letter"]
        assert [d["title"] for d in body["items"]] == ["CL3", "CL2"]

    @pytest.mark.asyncio
    async def test_total_follows_the_application_filter(self, db, user_factory, as_user) -> None:
        user = await user_factory()
        uid = uuid.UUID(user["id"])
        company = Company(user_id=uid, name="Acme")
        db.add(company)
        await db.flush()
        application = Application(user_id=uid, company_id=company.id, role_title="Eng")
        db.add(application)
        await db.flush()
        for i in range(3):
            db.add(Document(user_id=uid, title=f"Linked{i}", kind="cover_letter", body="b", application_id=application.id))
        await _seed(db, uid, 5, title_prefix="Loose")

        async with await as_user(user) as authed:
            body = await _page(authed, f"application_id={application.id}&limit=2")

        assert body["total"] == 3
        assert len(body["items"]) == 2

    @pytest.mark.asyncio
    async def test_total_follows_the_kind_and_application_filters_together(self, db, user_factory, as_user) -> None:
        user = await user_factory()
        uid = uuid.UUID(user["id"])
        company = Company(user_id=uid, name="Acme")
        db.add(company)
        await db.flush()
        application = Application(user_id=uid, company_id=company.id, role_title="Eng")
        db.add(application)
        await db.flush()
        for i, kind in enumerate(["cover_letter", "cover_letter", "cover_letter", "tailored_resume", "tailored_resume"]):
            db.add(
                Document(
                    id=uuid.uuid4(),
                    user_id=uid,
                    title=f"Linked{i}",
                    kind=kind,
                    body="b",
                    application_id=application.id,
                    updated_at=_BASE + _dt.timedelta(minutes=i),
                ),
            )
        # Same kind, other application: matches one filter but not the other.
        await _seed(db, uid, 4, kind="cover_letter", title_prefix="Loose", start=20)
        await db.commit()

        async with await as_user(user) as authed:
            body = await _page(authed, f"application_id={application.id}&kind=cover_letter&limit=2")

        assert body["total"] == 3
        assert body["has_more"] is True
        assert [d["title"] for d in body["items"]] == ["Linked2", "Linked1"]

    @pytest.mark.asyncio
    async def test_total_excludes_soft_deleted_and_other_users(self, db, user_factory, as_user) -> None:
        alice = await user_factory()
        bob = await user_factory()
        await _seed(db, uuid.UUID(alice["id"]), 3)
        await _seed(db, uuid.UUID(alice["id"]), 2, title_prefix="Gone", start=50, deleted=True)
        await _seed(db, uuid.UUID(bob["id"]), 5, title_prefix="Bob")

        async with await as_user(alice) as authed:
            body = await _page(authed, "limit=1")

        assert body["total"] == 3
        assert body["items"][0]["title"].startswith("Doc")

    @pytest.mark.asyncio
    async def test_total_is_zero_for_an_empty_list(self, db, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            body = await _page(authed, "")
        assert body == {"items": [], "total": 0, "has_more": False}


class TestPagingIsStable:
    @pytest.mark.asyncio
    async def test_pages_follow_newest_first(self, db, user_factory, as_user) -> None:
        user = await user_factory()
        await _seed(db, uuid.UUID(user["id"]), 5)

        async with await as_user(user) as authed:
            titles = []
            for offset in (0, 2, 4):
                titles += [d["title"] for d in (await _page(authed, f"limit=2&offset={offset}"))["items"]]

        assert titles == ["Doc4", "Doc3", "Doc2", "Doc1", "Doc0"]

    @pytest.mark.asyncio
    async def test_rows_tied_on_every_timestamp_never_repeat_or_skip(self, db, user_factory, as_user) -> None:
        user = await user_factory()
        ids = await _seed(db, uuid.UUID(user["id"]), 9, tied=True)

        async with await as_user(user) as authed:
            seen: list[str] = []
            for offset in range(0, 9, 2):
                seen += [d["id"] for d in (await _page(authed, f"limit=2&offset={offset}"))["items"]]
            again: list[str] = []
            for offset in range(0, 9, 4):
                again += [d["id"] for d in (await _page(authed, f"limit=4&offset={offset}"))["items"]]

        assert sorted(seen) == sorted(str(i) for i in ids)
        assert len(set(seen)) == 9
        assert again == seen, "the order is the same whatever the page size"
        assert seen == sorted(seen, reverse=True), "ties fall back to id, newest id first"


class TestPagingParamsAreValidated:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "query",
        ["limit=0", "limit=-1", f"limit={MAX_DOCUMENT_PAGE_SIZE + 1}", "offset=-1", "limit=abc", "offset=abc"],
    )
    async def test_out_of_range_is_422(self, user_factory, as_user, query: str) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get(f"/documents?{query}")
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_the_largest_page_is_allowed(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            body = await _page(authed, f"limit={MAX_DOCUMENT_PAGE_SIZE}")
        assert body["total"] == 0

    @pytest.mark.asyncio
    async def test_offset_past_the_end_is_an_empty_page_with_the_real_total(self, db, user_factory, as_user) -> None:
        user = await user_factory()
        await _seed(db, uuid.UUID(user["id"]), 3)
        async with await as_user(user) as authed:
            body = await _page(authed, "offset=50")
        assert body == {"items": [], "total": 3, "has_more": False}
