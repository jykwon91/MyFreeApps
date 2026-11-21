"""Read/write the shared cost-transparency object + project the response.

The transparency data is a single JSON object (:class:`TransparencyDocument`)
in a SHARED MinIO bucket (``settings.transparency_shared_bucket``, default
``myfreeapps-shared``) — distinct from each app's own per-app bucket. The
operator creates that bucket once and grants every app's MinIO user
read+write access (see the PR's Operational migration section).

Why a shared object and not a shared DB: per-app Postgres is isolated by
design, and the figures are platform-wide (one VPS, identical on every
app's page). A single object in a shared bucket gives every app the same
numbers with no cross-app DB coupling — one writer, N readers.

This module owns:
- a cached storage client bound to the SHARED bucket (separate from the
  app's own ``get_storage()`` which targets the app bucket),
- ``load_document`` / ``save_document``, and
- ``project_response`` — turn the stored doc plus the month's donation
  records into the public :class:`TransparencyResponse`.

Concurrency: ``report.json`` has ONE writer, the primary app's daily cost
poll, so its read-change-write cannot lose an update. Ko-fi donations are
not written here at all; each is its own object (``donation_store``), so
concurrent donations never share an object either.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Protocol

from minio.error import S3Error

from platform_shared.core.storage import (
    StorageClient,
    StorageNotConfiguredError,
    build_storage_client,
)
from platform_shared.schemas.transparency import (
    MONTHS_RETAINED,
    TRANSPARENCY_OBJECT_KEY,
    MonthBucket,
    TransparencyDocument,
    TransparencyResponse,
)
from platform_shared.schemas.transparency_donation_record import DonationRecord

logger = logging.getLogger(__name__)

# Codes that mean "the shared transparency object isn't there to read" — a
# setup / not-configured condition, NOT a transient outage. We map these to
# ``None`` (→ ``configured=False`` → the widget hides) instead of a 503. Covers
# the object not being written yet (fresh deploy, before the primary's first
# sync) AND the shared bucket not existing yet (before the operator runs the
# operational migration — and the steady state for any app not on the shared
# MinIO at all, e.g. MGA serving from Cloudflare R2). Transient / auth failures
# carry a different code and still raise → 503 ("temporarily unavailable").
_NOT_FOUND_CODES = {"NoSuchKey", "NoSuchObject", "NoSuchBucket"}


class SharedStorageSettings(Protocol):
    """The settings fields the shared-bucket client needs.

    BaseAppSettings satisfies this; using a Protocol keeps this module
    decoupled from any specific app's Settings subclass.
    """

    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_secure: bool
    transparency_shared_bucket: str


# Module-level singleton for the SHARED-bucket client. Cached like the
# per-app ``get_storage()`` singleton; reset via ``reset_shared_storage_cache``
# in tests. We never presign the transparency object (it is read server-side,
# not handed to the browser), so no public_endpoint / dual-endpoint client
# is needed.
_shared_client: StorageClient | None = None


def get_shared_storage(settings: SharedStorageSettings) -> StorageClient:
    """Return a cached storage client bound to the SHARED bucket.

    Raises :class:`StorageNotConfiguredError` (from ``build_storage_client``)
    when MinIO is unconfigured — callers map that to "not configured yet"
    on the read path and surface it on the write path.
    """
    global _shared_client
    if _shared_client is None:
        _shared_client = build_storage_client(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            bucket=settings.transparency_shared_bucket,
            # No public_endpoint: the object is never presigned for a browser.
            public_endpoint=None,
            secure=settings.minio_secure,
        )
    return _shared_client


def reset_shared_storage_cache() -> None:
    """Drop the cached shared-bucket client. Test-only helper."""
    global _shared_client
    _shared_client = None


def load_document(settings: SharedStorageSettings) -> TransparencyDocument | None:
    """Load the stored transparency document.

    Returns ``None`` when the shared object — or the shared bucket itself — does
    not exist yet (fresh deploy / before the operator's migration, and the
    steady state for an app not on the shared MinIO). That is the "not
    configured" state (the widget hides). Re-raises on every other failure:

    - :class:`StorageNotConfiguredError` — MinIO unconfigured (dev / pre-setup).
    - :class:`~minio.error.S3Error` (non-NoSuchKey) — transient outage / auth.
    - :class:`pydantic.ValidationError` / ``ValueError`` — corrupt object.

    The read path treats unconfigured as "not configured" (hide widget) and
    transient/corrupt as a 503; the write path lets them propagate so it
    never overwrites a present-but-unreadable object with a fresh blank one.
    """
    client = get_shared_storage(settings)
    try:
        raw = client.download_file(TRANSPARENCY_OBJECT_KEY)
    except S3Error as exc:
        if exc.code in _NOT_FOUND_CODES:
            return None
        raise
    return TransparencyDocument.model_validate_json(raw)


def save_document(settings: SharedStorageSettings, document: TransparencyDocument) -> None:
    """Persist the transparency document, overwriting the single object.

    Only the cost poll calls this; it is the object's single writer.
    """
    client = get_shared_storage(settings)
    payload = document.model_dump_json().encode("utf-8")
    client.upload_file(TRANSPARENCY_OBJECT_KEY, payload, "application/json")


def month_key(now: datetime) -> str:
    """Bucket key for a moment in time, e.g. ``"2026-06"`` (UTC-naming)."""
    return now.strftime("%Y-%m")


def month_label(now: datetime) -> str:
    """Human display label for a moment in time, e.g. ``"June 2026"``."""
    return now.strftime("%B %Y")


def prune_old_months(document: TransparencyDocument, now: datetime) -> None:
    """Drop all but the most recent ``MONTHS_RETAINED`` monthly buckets.

    Keeps the object bounded (donation records are pruned separately, by
    ``donation_store.prune_old_donations``). Sorting by
    the ``"YYYY-MM"`` key is chronological because the format is
    zero-padded and fixed-width.
    """
    if len(document.months) <= MONTHS_RETAINED:
        return
    keep = sorted(document.months.keys(), reverse=True)[:MONTHS_RETAINED]
    keep_set = set(keep)
    document.months = {k: v for k, v in document.months.items() if k in keep_set}


def legacy_report_has_donation(document: TransparencyDocument | None, message_id: str) -> bool:
    """Whether ``message_id`` is still listed in the old in-report dedup lists.

    True only for donations counted before they became per-donation objects
    and not yet moved out by the cost poll (any month).
    """
    if document is None:
        return False
    return any(message_id in bucket.donation_message_ids for bucket in document.months.values())


def month_donations_cents(
    document: TransparencyDocument | None,
    month: str,
    records: list[DonationRecord],
) -> int:
    """Total donations for ``month``: the per-donation records plus any
    not-yet-migrated total still inside ``report.json``.

    A record whose id is still listed in ``report.json`` is skipped: its
    amount is already in that old total, and the migration is between writing
    the records and saving the emptied report.
    """
    legacy = (document.months.get(month) if document is not None else None) or MonthBucket()
    legacy_ids = set(legacy.donation_message_ids)
    return legacy.donations_cents + sum(
        record.amount_cents for record in records if record.message_id not in legacy_ids
    )


def project_response(
    document: TransparencyDocument | None,
    now: datetime,
    records: list[DonationRecord],
) -> TransparencyResponse:
    """Project the stored document and ``now``'s month's donation records
    into the public response.

    ``configured`` is ``costs_cents > 0`` — the operator has set up monthly
    costs (fixed constants and/or Anthropic spend), which is exactly the
    "has the operator configured costs" signal the widget keys off to decide
    whether to render. A month with no bucket (object missing, or a brand-new
    month before the first poll) reports zeros + ``configured=False``.
    """
    key = month_key(now)
    donations = month_donations_cents(document, key, records)
    if document is None:
        return TransparencyResponse(
            month=month_label(now),
            costs_cents=0,
            donations_cents=donations,
            updated_at=None,
            configured=False,
        )
    bucket = document.months.get(key) or MonthBucket()
    return TransparencyResponse(
        month=month_label(now),
        costs_cents=bucket.costs_cents,
        donations_cents=donations,
        updated_at=document.updated_at,
        configured=bucket.costs_cents > 0,
    )


def get_or_create_bucket(document: TransparencyDocument, now: datetime) -> MonthBucket:
    """Return the current month's bucket, creating an empty one if absent."""
    key = month_key(now)
    bucket = document.months.get(key)
    if bucket is None:
        bucket = MonthBucket()
        document.months[key] = bucket
    return bucket


__all__ = [
    "get_shared_storage",
    "reset_shared_storage_cache",
    "load_document",
    "save_document",
    "month_key",
    "month_label",
    "prune_old_months",
    "project_response",
    "legacy_report_has_donation",
    "month_donations_cents",
    "SharedStorageSettings",
    "get_or_create_bucket",
    "StorageNotConfiguredError",
    "S3Error",
]
