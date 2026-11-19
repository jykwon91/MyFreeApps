"""GET /documents/page and GET /documents/selection: the documents list a page at a time, and "select all"."""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.document_list_constants import MAX_DOCUMENT_PAGE_SIZE
from app.core.permissions import current_org_member
from app.main import app
from app.models.documents.document import Document
from app.models.organization.organization_member import OrgRole
from tests.document_support import make_document, mock_session_factory, setup_org_and_user

QUERY_SERVICE = "app.services.documents.document_query_service"
START = datetime(2026, 1, 1, tzinfo=timezone.utc)


@pytest_asyncio.fixture
async def world(db: AsyncSession) -> AsyncIterator[tuple[AsyncClient, uuid.UUID, uuid.UUID]]:
    user, org_id = await setup_org_and_user(db)
    ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.VIEWER)
    app.dependency_overrides[current_org_member] = lambda: ctx
    fake_session, _ = mock_session_factory(db)
    try:
        with patch(f"{QUERY_SERVICE}.AsyncSessionLocal", fake_session):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                yield client, org_id, user.id
    finally:
        app.dependency_overrides.clear()


def _doc(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str,
    *,
    age_days: int = 0,
    status: str = "completed",
    document_type: str | None = "invoice",
    source: str = "upload",
) -> Document:
    document = make_document(org_id, user_id, status=status)
    document.file_name = name
    document.document_type = document_type
    document.source = source
    document.created_at = START - timedelta(days=age_days)
    return document


async def _names(client: AsyncClient, query: str = "") -> list[str]:
    resp = await client.get(f"/documents/page?{query}")
    assert resp.status_code == 200
    return [item["file_name"] for item in resp.json()["items"]]


@pytest.mark.asyncio
async def test_pages_through_every_document_newest_first_with_the_total(db: AsyncSession, world) -> None:
    client, org_id, user_id = world
    db.add_all([_doc(org_id, user_id, f"doc-{day}.pdf", age_days=day) for day in range(5)])
    await db.commit()

    first = (await client.get("/documents/page?limit=2")).json()
    last = (await client.get("/documents/page?limit=2&offset=4")).json()

    assert [item["file_name"] for item in first["items"]] == ["doc-0.pdf", "doc-1.pdf"]
    assert (first["total"], first["has_more"]) == (5, True)
    assert [item["file_name"] for item in last["items"]] == ["doc-4.pdf"]
    assert (last["total"], last["has_more"]) == (5, False)


@pytest.mark.asyncio
async def test_reaches_documents_past_the_old_thousand_cap(db: AsyncSession, world) -> None:
    client, org_id, user_id = world
    db.add_all([_doc(org_id, user_id, f"doc-{n}.pdf", age_days=n) for n in range(1001)])
    await db.commit()

    page = (await client.get(f"/documents/page?limit={MAX_DOCUMENT_PAGE_SIZE}&offset=1000")).json()

    assert page["total"] == 1001
    assert [item["file_name"] for item in page["items"]] == ["doc-1000.pdf"]
    assert page["has_more"] is False


@pytest.mark.asyncio
async def test_narrows_by_search_status_type_and_source(db: AsyncSession, world) -> None:
    client, org_id, user_id = world
    db.add_all([
        _doc(org_id, user_id, "Lumber_receipt.pdf", age_days=0, document_type="receipt"),
        _doc(org_id, user_id, "power-bill.pdf", age_days=1, status="failed", document_type=None),
        _doc(org_id, user_id, "rent.pdf", age_days=2, source="email"),
        _doc(org_id, user_id, "100%_sure.pdf", age_days=3, status="duplicate"),
    ])
    await db.commit()

    assert await _names(client, "search=LUMBER") == ["Lumber_receipt.pdf"]
    # A % or _ in the search is matched as itself, not as a wildcard.
    assert await _names(client, "search=0%25_") == ["100%_sure.pdf"]
    assert await _names(client, "statuses=failed&statuses=duplicate") == ["power-bill.pdf", "100%_sure.pdf"]
    assert await _names(client, "document_types=receipt") == ["Lumber_receipt.pdf"]
    # A document with no type is matched by the empty choice, as the website's filter does.
    assert await _names(client, "document_types=") == ["power-bill.pdf"]
    assert await _names(client, "sources=email") == ["rent.pdf"]
    assert await _names(client, "needs_review=true") == ["power-bill.pdf", "100%_sure.pdf"]
    assert await _names(client, "exclude_processing=true") == ["Lumber_receipt.pdf", "power-bill.pdf", "rent.pdf"]
    total = (await client.get("/documents/page?statuses=failed")).json()["total"]
    assert total == 1


@pytest.mark.asyncio
async def test_orders_by_a_column_in_either_direction_with_ties_kept_stable(db: AsyncSession, world) -> None:
    client, org_id, user_id = world
    db.add_all([
        _doc(org_id, user_id, "bravo.pdf", age_days=0),
        _doc(org_id, user_id, "Alpha.pdf", age_days=1),
        _doc(org_id, user_id, "charlie.pdf", age_days=2),
    ])
    await db.commit()

    assert await _names(client, "sort_by=file_name&sort_dir=asc") == ["Alpha.pdf", "bravo.pdf", "charlie.pdf"]
    assert await _names(client, "sort_by=file_name&sort_dir=desc") == ["charlie.pdf", "bravo.pdf", "Alpha.pdf"]
    assert await _names(client, "sort_by=created_at&sort_dir=asc") == ["charlie.pdf", "Alpha.pdf", "bravo.pdf"]
    # Equal types fall back to newest first, so paging never repeats or skips a row.
    assert await _names(client, "sort_by=document_type&sort_dir=asc") == ["bravo.pdf", "Alpha.pdf", "charlie.pdf"]


@pytest.mark.asyncio
async def test_leaves_out_other_organizations_and_deleted_documents(db: AsyncSession, world) -> None:
    client, org_id, user_id = world
    other_user, other_org = await setup_org_and_user(db)
    gone = _doc(org_id, user_id, "gone.pdf")
    gone.deleted_at = START
    db.add_all([gone, _doc(other_org, other_user.id, "theirs.pdf"), _doc(org_id, user_id, "mine.pdf")])
    await db.commit()

    page = (await client.get("/documents/page")).json()
    refs = (await client.get("/documents/selection")).json()

    assert [item["file_name"] for item in page["items"]] == ["mine.pdf"]
    assert page["total"] == 1
    assert len(refs) == 1


@pytest.mark.asyncio
async def test_refuses_a_page_bigger_than_the_maximum(world) -> None:
    client, _, _ = world

    resp = await client.get(f"/documents/page?limit={MAX_DOCUMENT_PAGE_SIZE + 1}")

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_selection_lists_every_match_across_pages_with_its_status(db: AsyncSession, world) -> None:
    client, org_id, user_id = world
    documents = [_doc(org_id, user_id, f"doc-{n}.pdf", age_days=n) for n in range(3)]
    reading = _doc(org_id, user_id, "reading.pdf", age_days=9, status="processing")
    other = _doc(org_id, user_id, "skip-me.pdf", age_days=10, source="email")
    db.add_all([*documents, reading, other])
    await db.commit()

    refs = (await client.get("/documents/selection?sources=upload")).json()

    assert refs == [
        *({"id": str(document.id), "status": "completed"} for document in documents),
        {"id": str(reading.id), "status": "processing"},
    ]


@pytest.mark.asyncio
async def test_page_and_selection_are_not_read_as_a_document_id(world) -> None:
    client, _, _ = world

    assert (await client.get("/documents/page")).status_code == 200
    assert (await client.get("/documents/selection")).status_code == 200
