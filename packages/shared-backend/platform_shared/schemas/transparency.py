"""Schemas for the platform-wide cost-transparency surface.

Two distinct shapes live here:

1. ``TransparencyResponse`` — the PUBLIC wire shape returned by
   ``GET /transparency``. It MUST match the frontend ``TransparencyData``
   interface in ``@platform/ui`` (``components/widgets/useTransparency.ts``)
   field-for-field: ``month``, ``costs_cents``, ``donations_cents``,
   ``updated_at``, ``configured``. The widget hides itself when
   ``configured`` is false and shows "temporarily unavailable" on any
   non-200, so this endpoint always returns 200 with this shape.

2. ``TransparencyDocument`` / ``MonthBucket`` — the PERSISTED shape stored
   as a single JSON object in the shared MinIO bucket. One app (the
   ``transparency_primary``) writes it (Ko-fi webhook → donations, daily
   cost poll → costs); every app reads it. Per-month buckets so the widget
   can show "this month's donations vs this month's costs"; old buckets are
   pruned by the cost sync to bound object growth.

Amounts are integer cents throughout to avoid float-rounding drift — the
same convention the frontend documents ("divide by 100 for display").
"""
from __future__ import annotations

from pydantic import BaseModel, Field

# Object key for the single shared transparency document. Lives under a
# ``transparency/`` prefix so the shared bucket can host other
# cross-app objects in the future without collision.
TRANSPARENCY_OBJECT_KEY = "transparency/report.json"

# Number of monthly buckets to retain in the stored document. We only ever
# display the current month; older buckets are kept briefly for debugging
# then pruned by the cost sync so the object (and its per-month dedup id
# lists) can't grow without bound.
MONTHS_RETAINED = 13


class TransparencyResponse(BaseModel):
    """Public response for ``GET /transparency``.

    Mirrors the frontend ``TransparencyData`` interface exactly. ``month``
    is a human label (e.g. ``"June 2026"``); the two ``*_cents`` fields are
    integer cents; ``updated_at`` is an ISO-8601 timestamp or ``None`` when
    nothing has synced yet; ``configured`` is false until the operator has
    configured monthly costs, which tells the widget to hide itself.
    """

    month: str
    costs_cents: int
    donations_cents: int
    updated_at: str | None
    configured: bool


class MonthBucket(BaseModel):
    """Per-month accumulator inside the stored document.

    ``donation_message_ids`` is the dedup set: Ko-fi can re-deliver a
    webhook, so each ``message_id`` is recorded once and re-deliveries are
    no-ops. ``costs_cents`` is computed by the daily poll (fixed monthly
    constants + that month's Anthropic spend); ``donations_cents`` is
    accumulated from verified webhooks.
    """

    donations_cents: int = 0
    costs_cents: int = 0
    donation_message_ids: list[str] = Field(default_factory=list)


class TransparencyDocument(BaseModel):
    """The single shared object persisted in the shared MinIO bucket.

    ``schema_version`` lets a future migration recognise older shapes.
    ``updated_at`` is the timestamp of the most recent write of any kind
    (donation received OR cost poll), surfaced to the widget as
    "last synced". ``months`` maps ``"YYYY-MM"`` → :class:`MonthBucket`.
    """

    schema_version: int = 1
    updated_at: str | None = None
    months: dict[str, MonthBucket] = Field(default_factory=dict)
