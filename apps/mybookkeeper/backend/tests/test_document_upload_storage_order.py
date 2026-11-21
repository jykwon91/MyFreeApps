"""Document files move to and from storage with no database transaction open.

Uploads go to storage before the transaction, and none are left behind.

Storing a file can take seconds when MinIO is slow. Done inside the
transaction it held row locks and a pooled connection all that time, and a
failure part-way through a zip left the files already stored with no row
pointing at them.
"""
from __future__ import annotations

import io
import uuid
import zipfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import func, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext, worker_context
from app.core.storage import get_storage
from app.models.documents.document import Document
from app.services.documents import document_query_service, document_upload_service
from app.services.documents.document_upload_service import accept_upload

pytestmark = pytest.mark.asyncio

_SVC = "app.services.documents.document_upload_service"


def _zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return buf.getvalue()


def _ctx() -> RequestContext:
    return worker_context(uuid.uuid4(), uuid.uuid4())


class _Transactions:
    """Stands in for ``unit_of_work`` on the test session and tracks whether one is open."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self.open = 0

    @asynccontextmanager
    async def __call__(self) -> AsyncIterator[AsyncSession]:
        self.open += 1
        try:
            yield self._db
        finally:
            self.open -= 1


def _wire(monkeypatch: pytest.MonkeyPatch, db: AsyncSession) -> _Transactions:
    transactions = _Transactions(db)
    monkeypatch.setattr(f"{_SVC}.unit_of_work", transactions)
    return transactions


def _deleted_keys() -> set[str]:
    return {key for call in get_storage().delete_files.call_args_list for key in call.args[0]}


def _stored_keys() -> list[str]:
    return [call.args[0] for call in get_storage().upload_file.call_args_list]


async def _live_count(db: AsyncSession, ctx: RequestContext) -> int:
    return (await db.execute(
        select(func.count()).select_from(Document).where(
            Document.organization_id == ctx.organization_id, Document.deleted_at.is_(None),
        )
    )).scalar_one()


async def test_files_are_stored_with_no_transaction_open(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    transactions = _wire(monkeypatch, db)
    open_during_upload: list[int] = []

    def upload(key: str, _content: bytes, _content_type: str) -> str:
        open_during_upload.append(transactions.open)
        return key

    get_storage().upload_file.side_effect = upload

    await accept_upload(
        _ctx(), content=_zip({"a.pdf": b"%PDF-1.4 a", "b.pdf": b"%PDF-1.4 b"}),
        filename="receipts.zip", content_type="application/zip",
    )

    assert open_during_upload == [0, 0]


async def test_a_zip_whose_upload_fails_part_way_leaves_no_files_and_no_rows(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _wire(monkeypatch, db)
    ctx = _ctx()
    calls = 0

    def upload(key: str, _content: bytes, _content_type: str) -> str:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise ConnectionError("MinIO went away")
        return key

    get_storage().upload_file.side_effect = upload

    with pytest.raises(ConnectionError):
        await accept_upload(
            ctx, content=_zip({"a.pdf": b"%PDF-1.4 a", "b.pdf": b"%PDF-1.4 b", "c.pdf": b"%PDF-1.4 c"}),
            filename="receipts.zip", content_type="application/zip",
        )

    attempted = _stored_keys()
    assert len(attempted) == 2
    assert _deleted_keys() == set(attempted)
    assert await _live_count(db, ctx) == 0


async def test_an_upload_over_the_daily_limit_stores_nothing(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _wire(monkeypatch, db)

    async def over_the_limit(*_args: object) -> int:
        return 10_000

    monkeypatch.setattr(document_upload_service.usage_log_repo, "count_today", over_the_limit)

    with pytest.raises(ValueError, match="Daily upload limit reached"):
        await accept_upload(_ctx(), content=b"%PDF-1.4 bill", filename="bill.pdf", content_type="application/pdf")

    get_storage().upload_file.assert_not_called()


async def test_an_upload_against_a_property_that_is_not_ours_stores_nothing(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _wire(monkeypatch, db)

    with pytest.raises(ValueError):
        await accept_upload(
            _ctx(), content=b"%PDF-1.4 bill", filename="bill.pdf", content_type="application/pdf",
            property_id=uuid.uuid4(),
        )

    get_storage().upload_file.assert_not_called()


async def test_an_upload_refused_in_the_transaction_removes_its_stored_file(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The limit was used up by another upload between the first check and the transaction."""
    _wire(monkeypatch, db)
    counts = iter([0, 10_000])

    async def used_up_meanwhile(*_args: object) -> int:
        return next(counts)

    monkeypatch.setattr(document_upload_service.usage_log_repo, "count_today", used_up_meanwhile)

    with pytest.raises(ValueError, match="Daily upload limit reached"):
        await accept_upload(_ctx(), content=b"%PDF-1.4 bill", filename="bill.pdf", content_type="application/pdf")

    assert len(_stored_keys()) == 1
    assert _deleted_keys() == set(_stored_keys())


async def test_a_duplicate_found_inside_the_transaction_gets_the_earlier_answer(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Another request accepted the same file between the first check and the
    transaction, using up the limit: the resend still gets that request's answer."""
    _wire(monkeypatch, db)
    ctx = _ctx()
    first = await accept_upload(ctx, content=b"%PDF-1.4 bill", filename="bill.pdf", content_type="application/pdf")
    real_check = document_upload_service._earlier_upload
    checks = 0

    async def misses_the_first_time(*args: object, **kwargs: bool):  # noqa: ANN202
        nonlocal checks
        checks += 1
        if checks == 1:
            return None, []
        return await real_check(*args, **kwargs)  # type: ignore[arg-type]

    counts = iter([0, 10_000])

    async def used_up_meanwhile(*_args: object) -> int:
        return next(counts)

    monkeypatch.setattr(f"{_SVC}._earlier_upload", misses_the_first_time)
    monkeypatch.setattr(document_upload_service.usage_log_repo, "count_today", used_up_meanwhile)
    get_storage().upload_file.reset_mock()

    again = await accept_upload(ctx, content=b"%PDF-1.4 bill", filename="bill.pdf", content_type="application/pdf")

    assert again["document_id"] == first["document_id"]
    assert again["duplicate"] is True
    [new_key] = _stored_keys()
    assert new_key in _deleted_keys()
    assert await _live_count(db, ctx) == 1


async def test_a_failed_document_re_extracted_meanwhile_is_not_replaced(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A re-extract flips the failed document back to processing after this upload
    found it: it keeps its row and its stored file."""
    _wire(monkeypatch, db)
    ctx = _ctx()
    first = await accept_upload(ctx, content=b"%PDF-1.4 bill", filename="bill.pdf", content_type="application/pdf")
    earlier = await db.get(Document, uuid.UUID(first["document_id"]))
    assert earlier is not None
    earlier_key = earlier.file_storage_key
    earlier.status = "failed"
    await db.commit()
    real_find = document_upload_service.document_repo.find_by_content_hash
    finds = 0

    async def re_extracted_after_the_locked_find(*args: object):  # noqa: ANN202
        nonlocal finds
        finds += 1
        found = await real_find(*args)  # type: ignore[arg-type]
        if finds == 2 and found is not None:  # the check inside the transaction
            # Another session's write: the row this upload loaded still reads "failed".
            await db.execute(
                sa_update(Document).where(Document.id == found.id).values(status="processing"),
                execution_options={"synchronize_session": False},
            )
        return found

    monkeypatch.setattr(document_upload_service.document_repo, "find_by_content_hash", re_extracted_after_the_locked_find)
    get_storage().delete_files.reset_mock()

    await accept_upload(ctx, content=b"%PDF-1.4 bill", filename="bill-again.pdf", content_type="application/pdf")

    await db.refresh(earlier)
    assert earlier.status == "processing"
    assert earlier.deleted_at is None
    assert earlier_key not in _deleted_keys()


async def test_a_resend_of_an_accepted_file_is_not_stored_again(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _wire(monkeypatch, db)
    ctx = _ctx()
    await accept_upload(ctx, content=b"%PDF-1.4 bill", filename="bill.pdf", content_type="application/pdf")
    get_storage().upload_file.reset_mock()

    again = await accept_upload(ctx, content=b"%PDF-1.4 bill", filename="bill.pdf", content_type="application/pdf")

    assert again["duplicate"] is True
    get_storage().upload_file.assert_not_called()


async def test_a_download_reads_the_file_with_the_session_closed(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _wire(monkeypatch, db)
    ctx = _ctx()
    result = await accept_upload(ctx, content=b"%PDF-1.4 bill", filename="bill.pdf", content_type="application/pdf")
    sessions = _Transactions(db)
    monkeypatch.setattr(document_query_service, "AsyncSessionLocal", sessions)
    open_during_read: list[int] = []

    def download(_key: str) -> bytes:
        open_during_read.append(sessions.open)
        return b"%PDF-1.4 bill"

    get_storage().download_file.side_effect = download

    download_result = await document_query_service.get_document_download(ctx, uuid.UUID(str(result["document_id"])))

    assert download_result is not None
    assert download_result.content == b"%PDF-1.4 bill"
    assert open_during_read == [0]
