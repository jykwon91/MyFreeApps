"""A rent receipt is emailed to the tenant at most once.

Each test walks one row of the dedup matrix: double taps, Gmail refusing,
Gmail answering ambiguously, the database failing after the email went out,
and a crashed attempt left mid-send. In every case the tenant gets one email.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core import storage as _storage_module
from app.models.applicants.applicant import Applicant
from app.models.email.email_filter_log import EmailFilterLog
from app.models.integrations.integration import Integration
from app.models.leases.pending_rent_receipt import PendingRentReceipt
from app.models.leases.rent_receipt_sequence import RentReceiptSequence
from app.models.leases.signed_lease import SignedLease
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.inquiries import inquiry_repo
from app.repositories.leases import pending_rent_receipt_repo
from app.services.email import app_sent_email_service, gmail_attachment_send_service
from app.services.email.constants import APP_SENT_RECEIPT_FILTER_REASON
from app.services.email.exceptions import (
    GmailReauthRequiredError,
    GmailSendError,
    GmailSendOutcomeUnknownError,
)
from app.services.leases import receipt_send_service, receipt_service
from app.services.leases.exceptions import (
    ReceiptAlreadySentError,
    ReceiptDismissedError,
    ReceiptGmailReauthError,
    ReceiptGmailSendError,
    ReceiptMissingLeaseError,
    ReceiptSendInProgressError,
    ReceiptSendUnconfirmedError,
    ReceiptSentNotRecordedError,
)
from app.services.leases.receipt_send_constants import RECEIPT_SEND_CLAIM_STALE_AFTER

PERIOD_START = _dt.date(2026, 7, 1)
PERIOD_END = _dt.date(2026, 7, 31)


class _RecordingStorage:
    bucket = "mock-bucket"

    def __init__(self) -> None:
        self.uploaded: list[str] = []
        self.deleted: list[str] = []
        self.fail_upload = False

    def upload_file(self, key: str, content: bytes, content_type: str) -> str:
        if self.fail_upload:
            raise ConnectionError("storage down")
        self.uploaded.append(key)
        return key

    def delete_file(self, key: str) -> None:
        self.deleted.append(key)


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> _RecordingStorage:
    recorder = _RecordingStorage()
    monkeypatch.setattr(_storage_module, "get_storage", lambda: recorder)
    return recorder


@pytest.fixture
def patch_session(monkeypatch: pytest.MonkeyPatch, _db_engine: AsyncEngine) -> None:
    """Give every service session its own session on the test engine, as in production."""

    @asynccontextmanager
    async def _factory():
        async with AsyncSession(bind=_db_engine, expire_on_commit=False) as session:
            yield session

    @asynccontextmanager
    async def _uow():
        async with AsyncSession(bind=_db_engine, expire_on_commit=False) as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    monkeypatch.setattr(receipt_send_service, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(receipt_send_service, "unit_of_work", _uow)
    monkeypatch.setattr(receipt_service, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(receipt_service, "unit_of_work", _uow)
    monkeypatch.setattr(app_sent_email_service, "unit_of_work", _uow)


@pytest.fixture
def gmail_send(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock(return_value="gmail-sent-1")
    monkeypatch.setattr(gmail_attachment_send_service, "send_message_with_attachment", mock)
    return mock


@pytest.fixture
def gmail_find(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock(return_value=None)
    monkeypatch.setattr(gmail_attachment_send_service, "find_sent_message_id", mock)
    return mock


async def _seed(
    db: AsyncSession, *, org: Organization, user: User, with_lease: bool = True,
) -> uuid.UUID:
    """Attributed rent payment with a queued receipt. Returns the transaction id."""
    inquiry = await inquiry_repo.create(
        db,
        organization_id=org.id,
        user_id=user.id,
        source="direct",
        received_at=_dt.datetime.now(_dt.timezone.utc),
        inquirer_name="Andrew Le",
        inquirer_email="andrew@example.com",
    )
    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        stage="lease_signed",
        legal_name="Andrew Le",
        inquiry_id=inquiry.id,
    )
    db.add(applicant)
    integration = Integration(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        provider="gmail",
        token_expiry=_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=1),
        metadata_={
            "scopes": [
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.send",
            ],
        },
    )
    integration.access_token = "tok"
    integration.refresh_token = "rt"
    db.add(integration)
    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        transaction_date=PERIOD_START,
        tax_year=2026,
        amount=Decimal("1500.00"),
        transaction_type="income",
        category="rental_revenue",
        status="approved",
        is_manual=False,
        applicant_id=applicant.id,
    )
    db.add(txn)
    if with_lease:
        db.add(SignedLease(
            user_id=user.id,
            organization_id=org.id,
            applicant_id=applicant.id,
            kind="imported",
            status="active",
            starts_on=_dt.date(2026, 1, 1),
            ends_on=_dt.date(2026, 12, 31),
        ))
    await db.flush()
    await pending_rent_receipt_repo.create_idempotent(
        db,
        user_id=user.id,
        organization_id=org.id,
        transaction_id=txn.id,
        applicant_id=applicant.id,
        signed_lease_id=None,
        period_start_date=PERIOD_START,
        period_end_date=PERIOD_END,
    )
    await db.commit()
    return txn.id


async def _send(org: Organization, user: User, txn_id: uuid.UUID):  # type: ignore[no-untyped-def]
    return await receipt_send_service.send_receipt(
        transaction_id=txn_id,
        organization_id=org.id,
        user_id=user.id,
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        payment_method="zelle",
    )


async def _row(db: AsyncSession, txn_id: uuid.UUID) -> PendingRentReceipt:
    return (await db.execute(
        select(PendingRentReceipt)
        .where(PendingRentReceipt.transaction_id == txn_id)
        .execution_options(populate_existing=True)
    )).scalar_one()


async def _count(db: AsyncSession, model: type) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def _age_claim(db: AsyncSession, txn_id: uuid.UUID) -> None:
    old = _dt.datetime.now(_dt.timezone.utc) - RECEIPT_SEND_CLAIM_STALE_AFTER - _dt.timedelta(minutes=1)
    await db.execute(
        update(PendingRentReceipt)
        .where(PendingRentReceipt.transaction_id == txn_id)
        .values(send_claimed_at=old)
    )
    await db.commit()


@pytest.fixture
def ids(test_org: Organization, test_user: User) -> tuple[Organization, User]:
    return test_org, test_user


pytestmark = pytest.mark.usefixtures("patch_session")


@pytest.mark.asyncio
async def test_happy_path_sends_once_and_files_the_receipt(
    db: AsyncSession, ids, storage, gmail_send,
) -> None:
    org, user = ids
    host_email = user.email
    txn_id = await _seed(db, org=org, user=user)

    result = await _send(org, user, txn_id)

    assert gmail_send.await_count == 1
    row = await _row(db, txn_id)
    assert row.status == "sent"
    assert row.sent_at is not None
    assert row.sent_via_attachment_id == result.attachment_id
    assert gmail_send.await_args.kwargs["message_id_header"] == row.send_message_id
    assert await _count(db, SignedLeaseAttachment) == 1
    assert storage.uploaded and not storage.deleted
    log = (await db.execute(select(EmailFilterLog))).scalar_one()
    assert log.message_id == "gmail-sent-1"
    assert log.reason == APP_SENT_RECEIPT_FILTER_REASON
    assert log.from_address == host_email


@pytest.mark.asyncio
async def test_no_lease_fails_before_any_email_number_or_upload(
    db: AsyncSession, ids, storage, gmail_send,
) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user, with_lease=False)

    with pytest.raises(ReceiptMissingLeaseError):
        await _send(org, user, txn_id)

    gmail_send.assert_not_awaited()
    assert (await _row(db, txn_id)).status == "pending"
    assert storage.uploaded == []
    assert await _count(db, RentReceiptSequence) == 0


@pytest.mark.asyncio
async def test_double_tap_emails_once(db: AsyncSession, ids, storage, monkeypatch) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    release = asyncio.Event()
    in_gmail = asyncio.Event()

    async def _slow_send(*args: object, **kwargs: object) -> str:
        in_gmail.set()
        await release.wait()
        return "gmail-sent-1"

    gmail_send = AsyncMock(side_effect=_slow_send)
    monkeypatch.setattr(gmail_attachment_send_service, "send_message_with_attachment", gmail_send)

    first = asyncio.create_task(_send(org, user, txn_id))
    await in_gmail.wait()
    with pytest.raises(ReceiptSendInProgressError):
        await _send(org, user, txn_id)
    release.set()
    await first

    assert gmail_send.await_count == 1
    assert (await _row(db, txn_id)).status == "sent"


@pytest.mark.asyncio
async def test_two_claims_only_one_wins(db: AsyncSession, ids) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    now = _dt.datetime.now(_dt.timezone.utc)

    first = await pending_rent_receipt_repo.claim_for_send(
        db, transaction_id=txn_id, organization_id=org.id,
        send_message_id="<a@x>", claimed_at=now,
    )
    second = await pending_rent_receipt_repo.claim_for_send(
        db, transaction_id=txn_id, organization_id=org.id,
        send_message_id="<b@x>", claimed_at=now,
    )
    assert first is not None
    assert second is None


@pytest.mark.asyncio
async def test_claim_is_scoped_to_the_organization(db: AsyncSession, ids) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    claimed = await pending_rent_receipt_repo.claim_for_send(
        db, transaction_id=txn_id, organization_id=uuid.uuid4(),
        send_message_id="<a@x>", claimed_at=_dt.datetime.now(_dt.timezone.utc),
    )
    assert claimed is None
    assert (await _row(db, txn_id)).status == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("gmail_error", "raised"),
    [
        (GmailSendError("400"), ReceiptGmailSendError),
        (GmailReauthRequiredError("expired"), ReceiptGmailReauthError),
    ],
)
async def test_definite_gmail_refusal_releases_and_a_retry_sends_once(
    db: AsyncSession, ids, storage, gmail_send, gmail_error, raised,
) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    gmail_send.side_effect = [gmail_error, "gmail-sent-2"]

    with pytest.raises(raised):
        await _send(org, user, txn_id)

    row = await _row(db, txn_id)
    assert row.status == "pending"
    assert row.send_message_id is None and row.send_claimed_at is None
    assert row.sent_via_attachment_id is None
    assert await _count(db, SignedLeaseAttachment) == 0
    assert storage.deleted == storage.uploaded

    await _send(org, user, txn_id)
    assert gmail_send.await_count == 2
    assert (await _row(db, txn_id)).status == "sent"
    assert await _count(db, SignedLeaseAttachment) == 1


@pytest.mark.asyncio
async def test_unknown_outcome_holds_the_claim(db: AsyncSession, ids, storage, gmail_send) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    gmail_send.side_effect = GmailSendOutcomeUnknownError("timeout")

    with pytest.raises(ReceiptSendUnconfirmedError):
        await _send(org, user, txn_id)
    assert (await _row(db, txn_id)).status == "sending"

    with pytest.raises(ReceiptSendInProgressError):
        await _send(org, user, txn_id)
    assert gmail_send.await_count == 1
    assert storage.deleted == []


@pytest.mark.asyncio
async def test_saving_fails_after_send_never_emails_again(
    db: AsyncSession, ids, storage, gmail_send, gmail_find, monkeypatch,
) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    real_mark = pending_rent_receipt_repo.mark_sent_if_claimed
    monkeypatch.setattr(
        pending_rent_receipt_repo, "mark_sent_if_claimed",
        AsyncMock(side_effect=ConnectionError("db went away")),
    )

    with pytest.raises(ReceiptSentNotRecordedError):
        await _send(org, user, txn_id)
    assert await _count(db, EmailFilterLog) == 1
    assert (await _row(db, txn_id)).status == "sending"

    with pytest.raises(ReceiptSendInProgressError):
        await _send(org, user, txn_id)

    monkeypatch.setattr(pending_rent_receipt_repo, "mark_sent_if_claimed", real_mark)
    await _age_claim(db, txn_id)
    gmail_find.return_value = "gmail-sent-1"
    with pytest.raises(ReceiptAlreadySentError):
        await _send(org, user, txn_id)

    row = await _row(db, txn_id)
    assert row.status == "sent"
    assert gmail_find.await_args.args[1] == row.send_message_id
    attachment = (await db.execute(select(SignedLeaseAttachment))).scalar_one()
    assert gmail_find.await_args.kwargs["attachment_filename"] == attachment.filename
    assert gmail_send.await_count == 1
    assert await _count(db, SignedLeaseAttachment) == 1


@pytest.mark.asyncio
async def test_stale_claim_not_in_gmail_is_released_and_sent_once(
    db: AsyncSession, ids, storage, gmail_send, gmail_find,
) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    gmail_send.side_effect = [GmailSendOutcomeUnknownError("reset"), "gmail-sent-2"]
    with pytest.raises(ReceiptSendUnconfirmedError):
        await _send(org, user, txn_id)
    abandoned_key = storage.uploaded[0]

    await _age_claim(db, txn_id)
    await _send(org, user, txn_id)

    assert gmail_find.await_count == 1
    assert gmail_send.await_count == 2
    assert (await _row(db, txn_id)).status == "sent"
    assert abandoned_key in storage.deleted
    assert await _count(db, SignedLeaseAttachment) == 1


@pytest.mark.asyncio
async def test_stale_claim_lookup_failure_changes_nothing(
    db: AsyncSession, ids, storage, gmail_send, gmail_find,
) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    gmail_send.side_effect = GmailSendOutcomeUnknownError("reset")
    with pytest.raises(ReceiptSendUnconfirmedError):
        await _send(org, user, txn_id)
    await _age_claim(db, txn_id)
    before = await _row(db, txn_id)
    message_id = before.send_message_id

    gmail_find.side_effect = ConnectionError("gmail unreachable")
    with pytest.raises(ReceiptSendUnconfirmedError):
        await _send(org, user, txn_id)

    after = await _row(db, txn_id)
    assert after.status == "sending"
    assert after.send_message_id == message_id
    assert gmail_send.await_count == 1


@pytest.mark.asyncio
async def test_release_with_an_old_message_id_changes_nothing(db: AsyncSession, ids) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    claimed = await pending_rent_receipt_repo.claim_for_send(
        db, transaction_id=txn_id, organization_id=org.id,
        send_message_id="<new@x>", claimed_at=_dt.datetime.now(_dt.timezone.utc),
    )
    assert claimed is not None
    released = await pending_rent_receipt_repo.release_claim(
        db, receipt_id=claimed.id, organization_id=org.id,
        send_message_id="<old@x>", released_at=_dt.datetime.now(_dt.timezone.utc),
    )
    assert released is False
    assert (await _row(db, txn_id)).status == "sending"


@pytest.mark.asyncio
async def test_upload_failure_releases_before_any_email(
    db: AsyncSession, ids, storage, gmail_send,
) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    storage.fail_upload = True

    with pytest.raises(ConnectionError):
        await _send(org, user, txn_id)

    gmail_send.assert_not_awaited()
    assert (await _row(db, txn_id)).status == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "raised"),
    [("sent", ReceiptAlreadySentError), ("dismissed", ReceiptDismissedError)],
)
async def test_finished_receipts_are_refused(
    db: AsyncSession, ids, storage, gmail_send, status, raised,
) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    await db.execute(
        update(PendingRentReceipt)
        .where(PendingRentReceipt.transaction_id == txn_id)
        .values(status=status)
    )
    await db.commit()

    with pytest.raises(raised):
        await _send(org, user, txn_id)
    gmail_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_no_pending_row_is_not_found(db: AsyncSession, ids, gmail_send) -> None:
    org, user = ids
    with pytest.raises(LookupError):
        await _send(org, user, uuid.uuid4())
    gmail_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_dismiss_mid_send_is_refused(db: AsyncSession, ids, gmail_send) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    gmail_send.side_effect = GmailSendOutcomeUnknownError("timeout")
    with pytest.raises(ReceiptSendUnconfirmedError):
        await _send(org, user, txn_id)

    with pytest.raises(ReceiptSendInProgressError):
        await receipt_service.dismiss_pending_receipt(
            transaction_id=txn_id, organization_id=org.id,
        )
    assert (await _row(db, txn_id)).status == "sending"


@pytest.mark.asyncio
async def test_dismiss_pending(db: AsyncSession, ids) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    await receipt_service.dismiss_pending_receipt(transaction_id=txn_id, organization_id=org.id)
    assert (await _row(db, txn_id)).status == "dismissed"


@pytest.mark.asyncio
async def test_open_count_includes_sends_gmail_has_not_confirmed(
    db: AsyncSession, ids, storage, gmail_send,
) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    assert await receipt_service.count_pending_receipts(org.id) == 1
    gmail_send.side_effect = GmailSendOutcomeUnknownError("timeout")
    with pytest.raises(ReceiptSendUnconfirmedError):
        await _send(org, user, txn_id)
    assert await receipt_service.count_pending_receipts(org.id) == 1
    listed = await receipt_service.list_pending_receipts(organization_id=org.id, limit=10, offset=0)
    assert [r.status for r in listed] == ["sending"]


@pytest.mark.asyncio
async def test_cancelled_upload_releases_the_claim(
    db: AsyncSession, ids, storage, gmail_send, monkeypatch,
) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)

    def _cancelled(key: str, content: bytes, content_type: str) -> str:
        raise asyncio.CancelledError()

    monkeypatch.setattr(storage, "upload_file", _cancelled)
    with pytest.raises(asyncio.CancelledError):
        await _send(org, user, txn_id)

    gmail_send.assert_not_awaited()
    assert (await _row(db, txn_id)).status == "pending"


@pytest.mark.asyncio
async def test_cancelled_after_upload_removes_the_pdf(
    db: AsyncSession, ids, storage, gmail_send, monkeypatch,
) -> None:
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    monkeypatch.setattr(
        receipt_send_service.signed_lease_attachment_repo, "create",
        AsyncMock(side_effect=asyncio.CancelledError()),
    )
    with pytest.raises(asyncio.CancelledError):
        await _send(org, user, txn_id)

    assert storage.uploaded and storage.deleted == storage.uploaded
    assert (await _row(db, txn_id)).status == "pending"
    gmail_send.assert_not_awaited()


@pytest.mark.asyncio
async def test_stale_send_found_by_its_attachment_is_marked_sent(
    db: AsyncSession, ids, storage, gmail_send, monkeypatch,
) -> None:
    """Gmail rewrote the Message-ID: the attachment search still finds the email."""
    org, user = ids
    txn_id = await _seed(db, org=org, user=user)
    gmail_send.side_effect = GmailSendOutcomeUnknownError("timeout")
    with pytest.raises(ReceiptSendUnconfirmedError):
        await _send(org, user, txn_id)
    await _age_claim(db, txn_id)
    filename = (await db.execute(select(SignedLeaseAttachment))).scalar_one().filename

    queries: list[str] = []

    def _list(**kwargs: object) -> MagicMock:
        queries.append(str(kwargs["q"]))
        chain = MagicMock()
        hit = kwargs["q"].startswith("from:me")  # type: ignore[union-attr]
        chain.execute.return_value = {"messages": [{"id": "gmail-late"}]} if hit else {}
        return chain

    service = MagicMock()
    service.users.return_value.messages.return_value.list = _list
    monkeypatch.setattr(
        gmail_attachment_send_service, "get_gmail_service",
        lambda *_: (service, MagicMock(token="tok")),
    )
    monkeypatch.setattr(gmail_attachment_send_service, "persist_refreshed_token", AsyncMock())

    with pytest.raises(ReceiptAlreadySentError):
        await _send(org, user, txn_id)

    assert queries[1] == f'from:me to:"andrew@example.com" filename:"{filename}"'
    assert (await _row(db, txn_id)).status == "sent"
    assert gmail_send.await_count == 1
