import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from platform_shared.repositories.audited_writes import insert_if_absent, lock_rows, update_rows
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from app.core.datetime_utils import as_utc
from app.models.email.email_queue import EmailQueue


async def get_by_id(db: AsyncSession, item_id: uuid.UUID) -> EmailQueue | None:
    result = await db.execute(
        select(EmailQueue).where(EmailQueue.id == item_id)
    )
    return result.scalar_one_or_none()


async def get_with_content(
    db: AsyncSession, item_id: uuid.UUID, organization_id: uuid.UUID
) -> EmailQueue | None:
    result = await db.execute(
        select(EmailQueue)
        .options(undefer(EmailQueue.raw_content))
        .where(
            EmailQueue.id == item_id,
            EmailQueue.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def get_message_ids(db: AsyncSession, organization_id: uuid.UUID) -> set[str]:
    """Return message_ids that should be EXCLUDED from re-fetch.

    Excludes:
      - Rows currently in flight (``fetched``, ``extracting``). A ``fetched``
        row may be waiting out a retry delay (``next_attempt_at``); the
        extraction drain picks it up again, not discovery.
      - Rows that successfully produced a Document (``done``)
      - ``dismissed`` rows: the user dismissed the email while it was being
        read, so it must not come back.
      - ``failed`` rows. A row is ``failed`` once its automatic retries ran
        out (or the failure can't be fixed by retrying), and it stays visible
        in the Sync Sessions panel until the user retries or dismisses it.
        Re-listing it would do nothing anyway: the insert hits the unique key
        on ``(user_id, message_id, attachment_id)``, so the sync would report
        the email as queued while nothing was read.

    Does NOT exclude:
      - ``skipped`` rows — re-fetch so the current prompt gets another chance
        (these are emails the extractor classified as duplicates/no-op; if the
        prompt has improved since, we want a re-run. Token cost is bounded
        because legit duplicates re-skip quickly.)

    ``processed_as_booking`` is treated the same as ``done`` — the email was
    routed through the booking pipeline and should not be re-fetched.
    """
    result = await db.execute(
        select(EmailQueue.message_id).where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status.in_(("fetched", "extracting", "done", "processed_as_booking", "failed", "dismissed")),
        )
    )
    return {row[0] for row in result.all()}


async def insert_ignore_conflict(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    message_id: str,
    sync_log_id: int,
    attachment_id: str,
    attachment_filename: str | None,
    attachment_content_type: str | None,
    email_subject: str | None,
) -> None:
    """Queue one attachment of a message, unless it's already queued.

    Idempotent on the unique key ``(user_id, message_id, attachment_id)``.
    """
    await insert_if_absent(
        db, EmailQueue,
        EmailQueue.user_id == user_id,
        EmailQueue.message_id == message_id,
        EmailQueue.attachment_id == attachment_id,
        create={
            "organization_id": organization_id,
            "user_id": user_id,
            "message_id": message_id,
            "sync_log_id": sync_log_id,
            "attachment_id": attachment_id,
            "attachment_filename": attachment_filename,
            "attachment_content_type": attachment_content_type,
            "email_subject": email_subject,
        },
    )


async def create_item(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    sync_log_id: int,
    message_id: str,
    attachment_filename: str | None,
    email_subject: str | None,
    status: str,
    error: str | None = None,
) -> EmailQueue:
    item = EmailQueue(
        organization_id=organization_id,
        user_id=user_id,
        sync_log_id=sync_log_id,
        message_id=message_id,
        attachment_id=message_id,
        attachment_filename=attachment_filename,
        email_subject=email_subject,
        status=status,
        error=error,
    )
    db.add(item)
    await db.flush()
    return item


async def reset_stuck(
    db: AsyncSession,
    organization_id: uuid.UUID,
    from_statuses: list[str],
    to_status: str,
    *,
    error: str | None = None,
) -> None:
    await update_rows(
        db,
        EmailQueue,
        EmailQueue.organization_id == organization_id,
        EmailQueue.status.in_(from_statuses),
        values={"status": to_status, "error": error},
    )


async def claim_next_pending(
    db: AsyncSession, organization_id: uuid.UUID
) -> EmailQueue | None:
    result = await db.execute(
        select(EmailQueue)
        .where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status == "pending",
        )
        .order_by(EmailQueue.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    return result.scalar_one_or_none()


async def claim_next_fetched(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    now: datetime,
    stale_before: datetime,
) -> EmailQueue | None:
    """Claim the oldest row that is ready to read, counting it as an attempt.

    Ready: ``fetched`` and due (never tried, or past its retry time), or an
    ``extracting`` claim from before ``stale_before`` (or with no claim time),
    which a drain that died left behind. The claim stamps ``claimed_at`` so
    the result is only written while this claim still holds.
    """
    result = await db.execute(
        select(EmailQueue)
        .options(undefer(EmailQueue.raw_content))
        .where(
            EmailQueue.organization_id == organization_id,
            or_(
                (EmailQueue.status == "fetched") & or_(
                    EmailQueue.next_attempt_at.is_(None),
                    EmailQueue.next_attempt_at <= now,
                ),
                (EmailQueue.status == "extracting") & or_(
                    EmailQueue.claimed_at.is_(None),
                    EmailQueue.claimed_at < stale_before,
                ),
            ),
        )
        .order_by(EmailQueue.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    item = result.scalar_one_or_none()
    if item is not None:
        item.status = "extracting"
        item.claimed_at = now
        item.attempts += 1
        item.next_attempt_at = None
    return item


async def lock_claim(
    db: AsyncSession, item_id: uuid.UUID, claimed_at: datetime,
) -> EmailQueue | None:
    """Lock the row if it is still ``extracting`` under this claim.

    None when it was dismissed, deleted or reclaimed meanwhile: the read's
    result must then be dropped, not written.
    """
    result = await db.execute(
        select(EmailQueue)
        .where(
            EmailQueue.id == item_id,
            EmailQueue.status == "extracting",
            EmailQueue.claimed_at == claimed_at,
        )
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def next_retry_at(db: AsyncSession, organization_id: uuid.UUID) -> datetime | None:
    """When the soonest fetched row that is waiting out a retry delay becomes due."""
    result = await db.execute(
        select(func.min(EmailQueue.next_attempt_at)).where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status == "fetched",
            EmailQueue.next_attempt_at > datetime.now(timezone.utc),
        )
    )
    retry_at = result.scalar_one_or_none()
    return as_utc(retry_at) if retry_at is not None else None


async def record_failed_attempt(
    db: AsyncSession,
    item_id: uuid.UUID,
    claimed_at: datetime,
    *,
    error: str,
    retry_at: datetime | None,
) -> bool:
    """End a claim whose read failed. False if the claim no longer holds.

    With ``retry_at`` the row goes back to ``fetched`` (its content is kept)
    and is claimed again once that time passes; without it the row is
    ``failed`` until the user retries it.
    """
    return bool(await update_rows(
        db,
        EmailQueue,
        EmailQueue.id == item_id,
        EmailQueue.status == "extracting",
        EmailQueue.claimed_at == claimed_at,
        values={
            "status": "fetched" if retry_at is not None else "failed",
            "error": error[:1000],
            "next_attempt_at": retry_at,
        },
    ))


async def release_claim(
    db: AsyncSession, item_id: uuid.UUID, claimed_at: datetime, *, retry_at: datetime,
) -> bool:
    """Hand a claim back without counting it: the read never reached Claude.

    The row goes back to ``fetched``, due at ``retry_at``, with the claim's
    attempt taken off again. False if the claim no longer holds.
    """
    rows = await lock_rows(
        db,
        EmailQueue,
        EmailQueue.id == item_id,
        EmailQueue.status == "extracting",
        EmailQueue.claimed_at == claimed_at,
    )
    for row in rows:
        row.status = "fetched"
        row.attempts -= 1
        row.next_attempt_at = retry_at
    await db.flush()
    return bool(rows)


async def dismiss_if_extracting(db: AsyncSession, item_id: uuid.UUID) -> bool:
    """Mark a row that is being read ``dismissed``, ending its claim. False if it isn't being read.

    The drain then drops whatever it read (it writes only while its claim
    holds), and the email is not fetched again.
    """
    return bool(await update_rows(
        db,
        EmailQueue,
        EmailQueue.id == item_id,
        EmailQueue.status == "extracting",
        values={"status": "dismissed", "error": None},
    ))


async def delete_item(db: AsyncSession, item: EmailQueue) -> None:
    await db.delete(item)


async def mark_status(
    db: AsyncSession,
    item: EmailQueue,
    status: str,
    *,
    error: str | None = None,
) -> None:
    item.status = status
    item.error = error


async def store_fetched_content(
    db: AsyncSession, item: EmailQueue, raw_content: bytes
) -> None:
    item.raw_content = raw_content
    item.status = "fetched"
    item.error = None


async def mark_done(
    db: AsyncSession, item: EmailQueue, *, reason: str | None = None
) -> None:
    """Mark a queue row as done.

    ``reason`` carries an optional human-readable note explaining why the
    email produced no records (e.g. "Duplicate", "Payment confirmation — no
    amount"). It is stored on ``error`` (a generic per-row note column) so the
    Sync Sessions UI can surface it. A done row with no records and no reason
    simply means the email's documents imported cleanly.
    """
    item.status = "done"
    item.raw_content = None
    item.error = reason[:1000] if reason else None


async def mark_skipped(db: AsyncSession, item: EmailQueue, *, reason: str | None = None) -> None:
    """Mark a queue row as skipped — extraction succeeded but produced no
    Document (e.g. classified as a payment-confirmation duplicate).

    Distinct from ``done`` so a future sync (with a possibly-improved prompt)
    can re-fetch and re-extract — see ``get_message_ids`` for the dedup rule.
    """
    item.status = "skipped"
    item.raw_content = None
    item.error = reason[:1000] if reason else None


async def count_by_status(
    db: AsyncSession, organization_id: uuid.UUID, status: str
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(EmailQueue)
        .where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status == status,
        )
    )
    return result.scalar_one()


async def count_pending_for_sync(
    db: AsyncSession, sync_log_id: int
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(EmailQueue)
        .where(
            EmailQueue.sync_log_id == sync_log_id,
            EmailQueue.status.in_(["pending", "fetching", "fetched", "extracting"]),
        )
    )
    return result.scalar_one()


async def list_recent(
    db: AsyncSession, organization_id: uuid.UUID, limit: int = 100
) -> Sequence[EmailQueue]:
    """The queue as the user sees it. A dismissed row stays only so the email isn't fetched again."""
    result = await db.execute(
        select(EmailQueue)
        .where(EmailQueue.organization_id == organization_id, EmailQueue.status != "dismissed")
        .order_by(EmailQueue.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def retry_item(db: AsyncSession, item: EmailQueue) -> str:
    if item.raw_content is not None:
        new_status = "fetched"
    else:
        new_status = "pending"
    item.status = new_status
    item.error = None
    item.attempts = 0
    item.next_attempt_at = None
    return new_status


async def retry_all_failed(db: AsyncSession, organization_id: uuid.UUID) -> None:
    # Items with raw_content -> fetched
    await update_rows(
        db,
        EmailQueue,
        EmailQueue.organization_id == organization_id,
        EmailQueue.status == "failed",
        EmailQueue.raw_content.isnot(None),
        values={"status": "fetched", "error": None, "attempts": 0, "next_attempt_at": None},
    )
    # Items without raw_content -> pending
    await update_rows(
        db,
        EmailQueue,
        EmailQueue.organization_id == organization_id,
        EmailQueue.status == "failed",
        EmailQueue.raw_content.is_(None),
        values={"status": "pending", "error": None, "attempts": 0, "next_attempt_at": None},
    )


async def get_status_counts_for_sync(
    db: AsyncSession, sync_log_id: int
) -> dict[str, int]:
    result = await db.execute(
        select(EmailQueue.status, func.count())
        .where(EmailQueue.sync_log_id == sync_log_id)
        .group_by(EmailQueue.status)
    )
    return {row[0]: row[1] for row in result.all()}


async def get_status_counts_batch(
    db: AsyncSession, sync_log_ids: list[int],
) -> dict[int, dict[str, int]]:
    if not sync_log_ids:
        return {}
    result = await db.execute(
        select(EmailQueue.sync_log_id, EmailQueue.status, func.count())
        .where(EmailQueue.sync_log_id.in_(sync_log_ids))
        .group_by(EmailQueue.sync_log_id, EmailQueue.status)
    )
    counts: dict[int, dict[str, int]] = {sid: {} for sid in sync_log_ids}
    for row in result.all():
        counts[row[0]][row[1]] = row[2]
    return counts
