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
- ``load_document`` / ``save_document`` (read-modify-write helpers), and
- ``project_response`` — turn the stored doc into the public
  :class:`TransparencyResponse` for the current month.

Concurrency note: writes (rare webhook donations + one daily poll) are
read-modify-write on a single object with no compare-and-set. The write
rate is low enough (a handful of donations/day + one poll) that a lost
update is improbable and self-heals on the next poll; we deliberately do
NOT reach for object-locking infrastructure the scale doesn't warrant.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Protocol

from minio.error import S3Error
from pydantic import ValidationError

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


class _StorageSettings(Protocol):
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


def get_shared_storage(settings: _StorageSettings) -> StorageClient:
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


def load_document(settings: _StorageSettings) -> TransparencyDocument | None:
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


def save_document(settings: _StorageSettings, document: TransparencyDocument) -> None:
    """Persist the transparency document, overwriting the single object."""
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

    Keeps the object (and its per-month dedup id lists) bounded. Sorting by
    the ``"YYYY-MM"`` key is chronological because the format is
    zero-padded and fixed-width.
    """
    if len(document.months) <= MONTHS_RETAINED:
        return
    keep = sorted(document.months.keys(), reverse=True)[:MONTHS_RETAINED]
    keep_set = set(keep)
    document.months = {k: v for k, v in document.months.items() if k in keep_set}


def project_response(
    document: TransparencyDocument | None,
    now: datetime,
) -> TransparencyResponse:
    """Project the stored document into the public response for ``now``'s month.

    ``configured`` is ``costs_cents > 0`` — the operator has set up monthly
    costs (fixed constants and/or Anthropic spend), which is exactly the
    "has the operator configured costs" signal the widget keys off to decide
    whether to render. A month with no bucket (object missing, or a brand-new
    month before the first poll) reports zeros + ``configured=False``.
    """
    label = month_label(now)
    if document is None:
        return TransparencyResponse(
            month=label,
            costs_cents=0,
            donations_cents=0,
            updated_at=None,
            configured=False,
        )
    bucket = document.months.get(month_key(now)) or MonthBucket()
    return TransparencyResponse(
        month=label,
        costs_cents=bucket.costs_cents,
        donations_cents=bucket.donations_cents,
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
    "get_or_create_bucket",
    "StorageNotConfiguredError",
    "S3Error",
]
