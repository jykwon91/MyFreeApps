"""Ko-fi donations, one object each, in the shared transparency bucket.

Each counted donation is stored at ``transparency/donations/<YYYY-MM>/<message_id>.json``.
The key depends only on the donation itself (Ko-fi's ``message_id`` and the
month of Ko-fi's own ``timestamp``), never on when the webhook arrived:

- Two donations arriving at once write two different keys, so neither can
  erase the other. There is no shared object to read, change and write back.
- A re-delivery maps to the same key whatever month it arrives in. The
  webhook sees the key exists and does not count it again; even if two
  copies race past that check, both write identical bytes to one key.

A month's donation total is the sum of the objects under its prefix. Only
the cost poll writes ``report.json``, so it has a single writer.

This module also owns the one-time move of donations recorded the old way
(totals and ids inside ``report.json``) into per-donation objects.
"""
from __future__ import annotations

import logging
import re
import time
from datetime import datetime

from pydantic import ValidationError

from platform_shared.schemas.transparency import MONTHS_RETAINED, TransparencyDocument
from platform_shared.schemas.transparency_donation_record import DonationRecord
from platform_shared.services.transparency import transparency_store
from platform_shared.services.transparency.store_constants import (
    DONATION_RECORD_SUFFIX,
    DONATION_RECORDS_CACHE_TTL_SECONDS,
    DONATIONS_PREFIX,
    KOFI_MESSAGE_ID_PATTERN,
)
from platform_shared.services.transparency.transparency_store import SharedStorageSettings

logger = logging.getLogger(__name__)

_MESSAGE_ID_RE = re.compile(KOFI_MESSAGE_ID_PATTERN)

# month -> (monotonic expiry, records). Per process; see store_constants.
_records_cache: dict[str, tuple[float, list[DonationRecord]]] = {}


def is_valid_message_id(message_id: str) -> bool:
    """Whether ``message_id`` can be used as-is in a key (``KOFI_MESSAGE_ID_PATTERN``)."""
    return _MESSAGE_ID_RE.fullmatch(message_id) is not None


def donation_key(month: str, message_id: str) -> str:
    """Object key for one donation.

    Raises ``ValueError`` for an id outside ``KOFI_MESSAGE_ID_PATTERN``:
    callers refuse those first, so this only guards against a missed check.
    """
    if not is_valid_message_id(message_id):
        raise ValueError(f"invalid Ko-fi message_id for a storage key: {message_id!r}")
    return f"{_month_prefix(month)}{message_id}{DONATION_RECORD_SUFFIX}"


def _month_prefix(month: str) -> str:
    return f"{DONATIONS_PREFIX}{month}/"


def donation_exists(settings: SharedStorageSettings, month: str, message_id: str) -> bool:
    """Whether this donation was already counted. Storage errors propagate."""
    client = transparency_store.get_shared_storage(settings)
    return client.object_exists(donation_key(month, message_id))


def write_donation(settings: SharedStorageSettings, record: DonationRecord) -> None:
    """Store ``record`` at its key. Writing the same record again is harmless."""
    client = transparency_store.get_shared_storage(settings)
    client.upload_file(
        donation_key(record.month, record.message_id),
        record.model_dump_json().encode("utf-8"),
        "application/json",
    )


def load_month_donations(settings: SharedStorageSettings, month: str) -> list[DonationRecord]:
    """Every donation counted toward ``month``, read fresh from storage."""
    client = transparency_store.get_shared_storage(settings)
    records: list[DonationRecord] = []
    for key in client.list_keys(_month_prefix(month)):
        if not key.endswith(DONATION_RECORD_SUFFIX):
            continue
        try:
            records.append(DonationRecord.model_validate_json(client.download_file(key)))
        except ValidationError:
            logger.error("Corrupt Ko-fi donation record: key=%s", key)
            raise
    return records


def load_month_donations_cached(settings: SharedStorageSettings, month: str) -> list[DonationRecord]:
    """``load_month_donations``, cached in memory for a short TTL.

    Failures are not cached, so the next request tries storage again.
    """
    now = time.monotonic()
    cached = _records_cache.get(month)
    if cached is not None and cached[0] > now:
        return cached[1]
    records = load_month_donations(settings, month)
    _records_cache[month] = (now + DONATION_RECORDS_CACHE_TTL_SECONDS, records)
    return records


def reset_donation_cache() -> None:
    """Drop cached donation records. Test-only helper."""
    _records_cache.clear()


def _shift_month(year: int, month: int, delta: int) -> str:
    index = year * 12 + (month - 1) + delta
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def oldest_retained_month(now: datetime) -> str:
    """The earliest ``"YYYY-MM"`` kept: ``MONTHS_RETAINED`` months ending with ``now``'s."""
    return _shift_month(now.year, now.month, -(MONTHS_RETAINED - 1))


def next_month(month: str) -> str:
    """The ``"YYYY-MM"`` after ``month``, e.g. ``"2026-12"`` → ``"2027-01"``."""
    year, number = month.split("-")
    return _shift_month(int(year), int(number), 1)


def prune_old_donations(settings: SharedStorageSettings, now: datetime) -> None:
    """Delete donation objects for months older than the retention window.

    Months are compared as zero-padded ``"YYYY-MM"`` strings, which sort
    chronologically. A delete that fails is logged by the storage client and
    retried on the next poll.
    """
    client = transparency_store.get_shared_storage(settings)
    oldest = oldest_retained_month(now)
    stale = [
        key for key in client.list_keys(DONATIONS_PREFIX)
        if key[len(DONATIONS_PREFIX):].split("/", 1)[0] < oldest
    ]
    if not stale:
        return
    failed = client.delete_files(stale)
    logger.info(
        "Pruned old Ko-fi donation records: deleted=%d failed=%d older_than=%s",
        len(stale) - len(failed),
        len(failed),
        oldest,
    )


def migrate_legacy_donations(settings: SharedStorageSettings, document: TransparencyDocument) -> None:
    """Move donations kept inside ``report.json`` out into per-donation objects.

    For each month that still has old-style ``donation_message_ids``, write
    one record per id (see :class:`DonationRecord` for how the month's total
    is carried), and only then empty that month's old fields in ``document``.
    The caller saves ``document`` after this returns, so if anything fails
    midway the old fields are still in ``report.json`` and the next poll
    simply rewrites the same records. Until that save, readers skip records
    whose ids are still listed in ``report.json``, and the webhook checks
    ``report.json`` before the records, so nothing is counted twice in between.

    Old records are filed under the month they ARRIVED in (the old code had
    no other date), which can be one month after Ko-fi's timestamp; the
    webhook's dedup also checks the next month for that reason.

    An id outside ``KOFI_MESSAGE_ID_PATTERN`` cannot be keyed. If a month has
    no usable id at all, it is left in ``report.json`` (still counted there)
    and logged at ERROR instead of losing its total.
    """
    for month, bucket in document.months.items():
        if not bucket.donation_message_ids:
            continue
        ids = sorted(set(bucket.donation_message_ids))
        usable = [message_id for message_id in ids if is_valid_message_id(message_id)]
        unusable = [message_id for message_id in ids if not is_valid_message_id(message_id)]
        if unusable:
            logger.error(
                "Legacy Ko-fi donation ids not usable as keys, so no record of their "
                "own (the webhook refuses such ids anyway; the month total is still "
                "carried): month=%s ids=%r",
                month,
                unusable,
            )
        if not usable:
            logger.error(
                "Legacy Ko-fi donations for month=%s kept in report.json: no usable id "
                "to carry total_cents=%d",
                month,
                bucket.donations_cents,
            )
            continue
        for index, message_id in enumerate(usable):
            write_donation(
                settings,
                DonationRecord(
                    message_id=message_id,
                    month=month,
                    amount_cents=bucket.donations_cents if index == 0 else 0,
                    migrated_from_report=True,
                ),
            )
        logger.info(
            "Moved legacy Ko-fi donations out of report.json: month=%s ids=%d total_cents=%d",
            month,
            len(usable),
            bucket.donations_cents,
        )
        bucket.donation_message_ids = []
        bucket.donations_cents = 0


__all__ = [
    "is_valid_message_id",
    "donation_key",
    "donation_exists",
    "write_donation",
    "load_month_donations",
    "load_month_donations_cached",
    "reset_donation_cache",
    "oldest_retained_month",
    "next_month",
    "prune_old_donations",
    "migrate_legacy_donations",
]
