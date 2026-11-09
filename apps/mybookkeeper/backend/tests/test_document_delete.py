"""Document delete, hide-when-deleted, and reference-only guards.

Single and bulk delete share one path: they act only on live documents the
organization owns, refuse documents still being read, clear in-database file
bytes, and remove stored files only after the commit succeeds.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.document_constants import (
    DOCUMENT_BEING_READ_DETAIL,
    EXTRACTION_TIMEOUT_SECONDS,
    MAX_BULK_DELETE_DOCUMENT_IDS,
    STALE_EXTRACTION_MARGIN_SECONDS,
)
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.documents.document import Document
from app.models.extraction.extraction import Extraction
from app.models.organization.organization_member import OrgRole
from app.models.transactions.transaction import Transaction
from app.repositories import document_repo
from app.services.documents import document_ownership, document_upload_service
from app.services.documents import document_service
from tests.document_support import (
    make_document as _make_document,
    mock_session_factory as _mock_session_factory,
    setup_org_and_user as _setup_org_and_user,
)

SERVICE = "app.services.documents.document_service"
QUERY_SERVICE = "app.services.documents.document_query_service"
CLEANUP = "app.services.storage.stored_file_cleanup"


@pytest.fixture
def storage() -> Iterator[MagicMock]:
    fake = MagicMock()
    fake.delete_files.return_value = []
    with (
        patch(f"{CLEANUP}.get_storage", return_value=fake),
        patch(f"{SERVICE}.get_storage", return_value=fake),
    ):
        yield fake


@pytest_asyncio.fixture
async def world(db: AsyncSession, storage: MagicMock) -> AsyncIterator[tuple[AsyncClient, uuid.UUID, uuid.UUID]]:
    user, org_id = await _setup_org_and_user(db)
    ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[require_write_access] = lambda: ctx
    fake_session, fake_uow = _mock_session_factory(db)
    try:
        with (
            patch(f"{SERVICE}.unit_of_work", fake_uow),
            patch(f"{QUERY_SERVICE}.AsyncSessionLocal", fake_session),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                yield client, org_id, user.id
    finally:
        app.dependency_overrides.clear()


async def _add_doc(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, *, status: str = "completed",
    storage_key: str | None = None, deleted: bool = False,
) -> Document:
    doc = _make_document(org_id, user_id, status=status)
    doc.file_storage_key = storage_key
    if deleted:
        doc.deleted_at = datetime.now(timezone.utc)
        doc.status = "deleted"
    db.add(doc)
    await db.commit()
    return doc


async def _stored_content(db: AsyncSession, document_id: uuid.UUID) -> bytes | None:
    return (await db.execute(
        select(Document.file_content).where(Document.id == document_id)
    )).scalar_one()


async def _add_transaction(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, doc: Document,
) -> Transaction:
    extraction = Extraction(
        document_id=doc.id, organization_id=org_id, user_id=user_id,
        status="completed", raw_response={}, confidence="high",
        document_type="invoice", tokens_used=0,
    )
    db.add(extraction)
    await db.flush()
    txn = Transaction(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        transaction_date=date(2025, 6, 15), tax_year=2025, vendor="V",
        amount=Decimal("10.00"), transaction_type="expense", category="maintenance",
        extraction_id=extraction.id,
    )
    db.add(txn)
    await db.commit()
    return txn


class TestSingleDelete:
    @pytest.mark.asyncio
    async def test_deletes_a_live_document_and_clears_content(self, db, world, storage) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, storage_key="k/1")

        resp = await client.delete(f"/documents/{doc.id}")

        assert resp.status_code == 204
        await db.refresh(doc)
        assert doc.deleted_at is not None and doc.status == "deleted"
        assert await _stored_content(db, doc.id) is None
        storage.delete_files.assert_called_once_with(["k/1"])

    @pytest.mark.asyncio
    async def test_already_deleted_is_404_and_touches_nothing(self, db, world, storage) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, storage_key="k/1", deleted=True)
        await db.refresh(doc)
        stamped = doc.deleted_at

        resp = await client.delete(f"/documents/{doc.id}")

        assert resp.status_code == 404
        await db.refresh(doc)
        assert doc.deleted_at == stamped
        storage.delete_files.assert_not_called()

    @pytest.mark.asyncio
    async def test_missing_is_404(self, world) -> None:
        client, _, _ = world
        assert (await client.delete(f"/documents/{uuid.uuid4()}")).status_code == 404

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", ["processing", "extracting"])
    async def test_document_being_read_is_409(self, db, world, storage, status) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, status=status, storage_key="k/1")

        resp = await client.delete(f"/documents/{doc.id}")

        assert resp.status_code == 409
        assert "still being read" in resp.json()["detail"]
        await db.refresh(doc)
        assert doc.deleted_at is None
        storage.delete_files.assert_not_called()

    @pytest.mark.asyncio
    async def test_keeps_the_documents_transactions(self, db, world) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id)
        txn = await _add_transaction(db, org_id, user_id, doc)

        assert (await client.delete(f"/documents/{doc.id}")).status_code == 204

        await db.refresh(txn)
        assert txn.deleted_at is None


class TestStoredFileTiming:
    @pytest.mark.asyncio
    async def test_file_is_not_deleted_when_the_commit_fails(self, db, storage) -> None:
        user, org_id = await _setup_org_and_user(db)
        doc = await _add_doc(db, org_id, user.id, storage_key="k/1")
        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)

        @asynccontextmanager
        async def failing_commit() -> AsyncIterator[AsyncSession]:
            yield db
            raise RuntimeError("commit failed")

        with patch(f"{SERVICE}.unit_of_work", failing_commit):
            with pytest.raises(RuntimeError):
                await document_service.delete_documents(ctx, [doc.id])

        storage.delete_files.assert_not_called()

    @pytest.mark.asyncio
    async def test_storage_failure_after_commit_is_logged_not_raised(self, db, storage, caplog) -> None:
        user, org_id = await _setup_org_and_user(db)
        doc = await _add_doc(db, org_id, user.id, storage_key="k/1")
        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)
        storage.delete_files.side_effect = RuntimeError("minio down")
        _, fake_uow = _mock_session_factory(db)

        with patch(f"{SERVICE}.unit_of_work", fake_uow):
            result = await document_service.delete_documents(ctx, [doc.id])

        assert result.deleted == [doc.id]
        assert "Failed to delete stored files" in caplog.text


class TestBulkDelete:
    @pytest.mark.asyncio
    async def test_reports_exact_deleted_and_skipped_ids(self, db, world, storage) -> None:
        client, org_id, user_id = world
        live = await _add_doc(db, org_id, user_id, storage_key="k/live")
        gone = await _add_doc(db, org_id, user_id, storage_key="k/gone", deleted=True)
        reading = await _add_doc(db, org_id, user_id, status="extracting", storage_key="k/read")
        missing = uuid.uuid4()
        await db.refresh(gone)
        gone_stamp = gone.deleted_at

        resp = await client.post(
            "/documents/bulk-delete",
            json={"ids": [str(live.id), str(gone.id), str(reading.id), str(missing), str(live.id)]},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["deleted"] == [str(live.id)]
        assert sorted(body["skipped"], key=lambda s: s["id"]) == sorted(
            [
                {"id": str(gone.id), "reason": "not_found"},
                {"id": str(missing), "reason": "not_found"},
                {"id": str(reading.id), "reason": "being_read"},
            ],
            key=lambda s: s["id"],
        )
        await db.refresh(gone)
        await db.refresh(reading)
        assert gone.deleted_at == gone_stamp
        assert reading.deleted_at is None
        storage.delete_files.assert_called_once_with(["k/live"])

    @pytest.mark.asyncio
    async def test_other_organizations_documents_are_not_found(self, db, world) -> None:
        client, _, _ = world
        other_user, other_org = await _setup_org_and_user(db)
        foreign = await _add_doc(db, other_org, other_user.id)

        resp = await client.post("/documents/bulk-delete", json={"ids": [str(foreign.id)]})

        assert resp.json() == {"deleted": [], "skipped": [{"id": str(foreign.id), "reason": "not_found"}]}
        await db.refresh(foreign)
        assert foreign.deleted_at is None

    @pytest.mark.asyncio
    async def test_clears_in_database_content(self, db, world) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id)

        await client.post("/documents/bulk-delete", json={"ids": [str(doc.id)]})

        assert await _stored_content(db, doc.id) is None

    @pytest.mark.asyncio
    async def test_an_empty_list_is_422(self, world) -> None:
        client, _, _ = world
        assert (await client.post("/documents/bulk-delete", json={"ids": []})).status_code == 422

    @pytest.mark.asyncio
    async def test_ids_above_the_cap_are_422(self, world) -> None:
        client, _, _ = world
        ids = [str(uuid.uuid4()) for _ in range(MAX_BULK_DELETE_DOCUMENT_IDS + 1)]

        resp = await client.post("/documents/bulk-delete", json={"ids": ids})

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_ids_at_the_cap_are_accepted(self, world) -> None:
        client, _, _ = world
        ids = [str(uuid.uuid4()) for _ in range(MAX_BULK_DELETE_DOCUMENT_IDS)]

        resp = await client.post("/documents/bulk-delete", json={"ids": ids})

        assert resp.status_code == 200
        assert resp.json()["deleted"] == []


class TestDeletedDocumentsAreHidden:
    @pytest.mark.asyncio
    async def test_get_and_download_are_404(self, db, world) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, deleted=True)

        assert (await client.get(f"/documents/{doc.id}")).status_code == 404
        assert (await client.get(f"/documents/{doc.id}/download")).status_code == 404
        assert (await client.get(f"/documents/upload-status/{doc.id}")).status_code == 404

    @pytest.mark.asyncio
    async def test_live_document_is_still_readable(self, db, world) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id)

        assert (await client.get(f"/documents/{doc.id}")).status_code == 200
        assert (await client.get(f"/documents/{doc.id}/download")).status_code == 200


class TestReferenceOnlyMarking:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", ["processing", "extracting"])
    async def test_marking_while_being_read_is_409(self, db, world, status) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, status=status)

        resp = await client.patch(f"/documents/{doc.id}/escrow-paid", json={"is_escrow_paid": True})

        assert resp.status_code == 409
        await db.refresh(doc)
        assert doc.is_escrow_paid is False

    @pytest.mark.asyncio
    async def test_marking_a_completed_document_removes_its_transactions_and_unmarking_keeps_them_removed(
        self, db, world,
    ) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id)
        txn = await _add_transaction(db, org_id, user_id, doc)

        marked = await client.patch(f"/documents/{doc.id}/escrow-paid", json={"is_escrow_paid": True})
        unmarked = await client.patch(f"/documents/{doc.id}/escrow-paid", json={"is_escrow_paid": False})

        assert marked.json() == {"is_escrow_paid": True, "transactions_removed": 1}
        assert unmarked.json() == {"is_escrow_paid": False, "transactions_removed": 0}
        await db.refresh(txn)
        assert txn.deleted_at is not None

    @pytest.mark.asyncio
    async def test_marking_a_deleted_document_is_404(self, db, world) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, deleted=True)

        resp = await client.patch(f"/documents/{doc.id}/escrow-paid", json={"is_escrow_paid": True})

        assert resp.status_code == 404


async def _age_claim(db: AsyncSession, doc: Document, *, seconds: float) -> None:
    """Make the document's claim (its updated_at stamp) ``seconds`` old."""
    await db.execute(
        update(Document).where(Document.id == doc.id).values(
            updated_at=datetime.now(timezone.utc) - timedelta(seconds=seconds),
        )
    )
    await db.commit()


STALE = EXTRACTION_TIMEOUT_SECONDS + STALE_EXTRACTION_MARGIN_SECONDS + 60


class TestStaleClaims:
    @pytest.mark.asyncio
    async def test_a_claim_left_by_a_dead_worker_can_be_deleted(self, db, world, storage) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, status="extracting", storage_key="k/1")
        await _age_claim(db, doc, seconds=STALE)

        assert (await client.delete(f"/documents/{doc.id}")).status_code == 204
        storage.delete_files.assert_called_once_with(["k/1"])

    @pytest.mark.asyncio
    async def test_a_fresh_claim_is_still_being_read(self, db, world) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, status="extracting")
        await _age_claim(db, doc, seconds=EXTRACTION_TIMEOUT_SECONDS - 60)

        assert (await client.delete(f"/documents/{doc.id}")).status_code == 409

    @pytest.mark.asyncio
    async def test_a_stale_claim_can_be_re_extracted(self, db, world) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, status="extracting")
        await _age_claim(db, doc, seconds=STALE)

        assert (await client.post(f"/documents/{doc.id}/re-extract")).status_code == 202

    @pytest.mark.asyncio
    async def test_a_stale_claim_can_be_marked_reference_only(self, db, world) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, status="extracting")
        await _age_claim(db, doc, seconds=STALE)

        resp = await client.patch(f"/documents/{doc.id}/escrow-paid", json={"is_escrow_paid": True})

        assert resp.status_code == 200


class TestBeingReadGuardsOtherWrites:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", ["processing", "extracting"])
    async def test_re_extract_while_being_read_is_409(self, db, world, status) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, status=status)

        resp = await client.post(f"/documents/{doc.id}/re-extract")

        assert resp.status_code == 409
        assert resp.json()["detail"] == DOCUMENT_BEING_READ_DETAIL

    @pytest.mark.asyncio
    async def test_replacing_the_file_while_being_read_is_409_and_uploads_nothing(self, db, world, storage) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, status="extracting", storage_key="k/old")

        resp = await client.put(
            f"/documents/{doc.id}/file", files={"file": ("new.pdf", b"%PDF-1.4 new", "application/pdf")},
        )

        assert resp.status_code == 409
        storage.upload_file.assert_not_called()
        storage.delete_files.assert_not_called()

    @pytest.mark.asyncio
    async def test_replacing_a_deleted_documents_file_is_refused(self, db, world, storage) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, deleted=True)

        resp = await client.put(
            f"/documents/{doc.id}/file", files={"file": ("new.pdf", b"%PDF-1.4 new", "application/pdf")},
        )

        assert resp.status_code == 422
        storage.upload_file.assert_not_called()

    @pytest.mark.asyncio
    async def test_replacing_a_file_removes_the_old_object_after_the_commit(self, db, world, storage) -> None:
        client, org_id, user_id = world
        doc = await _add_doc(db, org_id, user_id, storage_key="k/old")
        storage.generate_key.return_value = "k/new"

        resp = await client.put(
            f"/documents/{doc.id}/file", files={"file": ("new.pdf", b"%PDF-1.4 new", "application/pdf")},
        )

        assert resp.status_code == 200
        storage.delete_files.assert_called_once_with(["k/old"])
        await db.refresh(doc)
        assert doc.file_storage_key == "k/new"

    @pytest.mark.asyncio
    async def test_a_failed_replace_removes_the_new_object_and_keeps_the_old(self, db, storage) -> None:
        user, org_id = await _setup_org_and_user(db)
        doc = await _add_doc(db, org_id, user.id, storage_key="k/old")
        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)
        storage.generate_key.return_value = "k/new"

        @asynccontextmanager
        async def failing_commit() -> AsyncIterator[AsyncSession]:
            yield db
            raise RuntimeError("commit failed")

        with patch(f"{SERVICE}.unit_of_work", failing_commit), pytest.raises(RuntimeError):
            await document_service.replace_file(ctx, doc.id, b"%PDF-1.4 new", "new.pdf", "application/pdf")

        storage.delete_files.assert_called_once_with(["k/new"])


class TestCancelBatch:
    @pytest.mark.asyncio
    async def test_cancels_queued_documents_and_leaves_live_claims(self, db, world, storage) -> None:
        client, org_id, user_id = world
        queued = await _add_doc(db, org_id, user_id, status="processing", storage_key="k/queued")
        claimed = await _add_doc(db, org_id, user_id, status="extracting", storage_key="k/claimed")
        done = await _add_doc(db, org_id, user_id, storage_key="k/done")
        for d in (queued, claimed, done):
            d.batch_id = "batch-1"
        await db.commit()

        resp = await client.post("/documents/batch-cancel/batch-1")

        assert resp.json() == {"cancelled": 1}
        for d in (queued, claimed, done):
            await db.refresh(d)
        assert queued.deleted_at is not None
        assert claimed.deleted_at is None and done.deleted_at is None
        storage.delete_files.assert_called_once_with(["k/queued"])


class TestFailedUploadReplacement:
    @pytest.mark.asyncio
    async def test_re_uploading_a_failed_file_removes_its_stored_object(self, db, storage) -> None:
        user, org_id = await _setup_org_and_user(db)
        failed = await _add_doc(db, org_id, user.id, status="failed", storage_key="k/failed")
        failed.file_name = "bill.pdf"
        await db.commit()
        ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)
        _, fake_uow = _mock_session_factory(db)
        storage.generate_key.return_value = "k/fresh"

        with (
            patch.object(document_upload_service, "unit_of_work", fake_uow),
            patch.object(document_upload_service, "get_storage", return_value=storage),
        ):
            await document_upload_service.accept_upload(ctx, b"%PDF-1.4 bill", "bill.pdf", "application/pdf")

        await db.refresh(failed)
        assert failed.deleted_at is not None
        storage.delete_files.assert_called_once_with(["k/failed"])


class TestClaimSkipsDeletedRows:
    @pytest.mark.asyncio
    async def test_a_deleted_queued_document_is_never_claimed(self, db) -> None:
        user, org_id = await _setup_org_and_user(db)
        doc = await _add_doc(db, org_id, user.id, status="processing")
        await document_repo.soft_delete_by_user(db, [doc.id])
        await db.commit()

        assert await document_repo.claim_next_processing(db) is None


class TestSourceDocumentOwnership:
    @pytest.mark.asyncio
    async def test_a_deleted_document_cannot_be_newly_cited(self, db) -> None:
        user, org_id = await _setup_org_and_user(db)
        doc = await _add_doc(db, org_id, user.id, deleted=True)

        assert not await document_ownership.owns_document(db, organization_id=org_id, document_id=doc.id)
        assert not await document_ownership.owns_document(
            db, organization_id=org_id, document_id=doc.id, current_document_id=uuid.uuid4(),
        )

    @pytest.mark.asyncio
    async def test_the_document_a_record_already_cites_stays_acceptable(self, db) -> None:
        user, org_id = await _setup_org_and_user(db)
        doc = await _add_doc(db, org_id, user.id, deleted=True)

        assert await document_ownership.owns_document(
            db, organization_id=org_id, document_id=doc.id, current_document_id=doc.id,
        )

    @pytest.mark.asyncio
    async def test_a_live_document_is_accepted(self, db) -> None:
        user, org_id = await _setup_org_and_user(db)
        doc = await _add_doc(db, org_id, user.id)

        assert await document_ownership.owns_document(db, organization_id=org_id, document_id=doc.id)
