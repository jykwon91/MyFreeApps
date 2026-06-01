"""Daily cost sync: recompute this month's platform costs and persist.

``costs_cents`` for a month = the fixed monthly constants the operator sets
(VPS + domain) PLUS that month's Anthropic API spend pulled from the Admin
Cost Report. Donations are written by the webhook; this sync owns only the
cost side of the shared object.

Run by the daily asyncio cost-sync loop (and once at startup) on the primary app.
It is idempotent — recomputing and overwriting the current month's
``costs_cents`` each run is correct, so a missed run simply self-heals on
the next one.

Failure posture (rules/check-third-party-error-codes + no-bandaid): if the
Anthropic fetch raises, we do NOT write a partial/zero cost — we let the
error propagate so the caller (the scheduler job wrapper) logs it and the
PREVIOUS cost figure stays intact rather than the widget flipping to a
wrong "$0 costs". An empty admin key is not a failure: it yields 0 Anthropic
cents and the costs reflect the fixed constants alone.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Protocol

from platform_shared.schemas.transparency import TransparencyDocument
from platform_shared.services.transparency import (
    anthropic_cost_service,
    transparency_store,
)

logger = logging.getLogger(__name__)


class _CostSyncSettings(Protocol):
    """Settings fields the cost sync reads. BaseAppSettings satisfies this."""

    anthropic_admin_api_key: str
    vps_monthly_cost_cents: int
    domain_monthly_cost_cents: int
    # Plus the storage fields consumed by transparency_store.get_shared_storage.
    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_secure: bool
    transparency_shared_bucket: str


def _month_start(now: datetime) -> datetime:
    """First instant of ``now``'s month, in UTC."""
    return now.astimezone(timezone.utc).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0,
    )


async def run_cost_sync(
    settings: _CostSyncSettings,
    now: datetime | None = None,
) -> int:
    """Recompute and persist the current month's ``costs_cents``.

    Returns the computed ``costs_cents`` (fixed constants + month-to-date
    Anthropic spend). Reads the shared document, updates ONLY the current
    month's cost side (leaving donations untouched), prunes stale months,
    bumps ``updated_at``, and writes it back.

    Raises :class:`~platform_shared.services.transparency.anthropic_cost_service.AnthropicCostError`
    if the Anthropic call fails — the caller decides whether to swallow it
    (it does: a daily job logs + retries tomorrow). Anthropic is fetched
    BEFORE any write so a failure never leaves a half-updated object.
    """
    now = now or datetime.now(timezone.utc)

    anthropic_cents = await anthropic_cost_service.fetch_cost_cents(
        api_key=settings.anthropic_admin_api_key,
        starting_at=_month_start(now),
        ending_at=now,
    )
    costs_cents = (
        int(settings.vps_monthly_cost_cents)
        + int(settings.domain_monthly_cost_cents)
        + anthropic_cents
    )

    document = transparency_store.load_document(settings) or TransparencyDocument()
    bucket = transparency_store.get_or_create_bucket(document, now)
    bucket.costs_cents = costs_cents
    document.updated_at = now.isoformat()
    transparency_store.prune_old_months(document, now)
    transparency_store.save_document(settings, document)

    logger.info(
        "Transparency cost sync: month=%s costs_cents=%d "
        "(vps=%d domain=%d anthropic=%d)",
        transparency_store.month_key(now),
        costs_cents,
        settings.vps_monthly_cost_cents,
        settings.domain_monthly_cost_cents,
        anthropic_cents,
    )
    return costs_cents


__all__ = ["run_cost_sync"]
