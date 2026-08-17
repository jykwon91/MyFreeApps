"""Fetch Texas dwelling-line rate filings from the TDI open dataset.

Network boundary only: this module talks to the Socrata host and turns rows
into ``InsuranceRateFiling`` objects. Which filings matter to which policy is
decided in ``insurance_market_watch_service`` — nothing here reads the database.

Mirrors ``properties/power_to_choose_client``: same cache shape, and the same
contract that a failure raises rather than returning an empty list, because
"TDI is unreachable" and "your carrier has filed nothing" must not render as
the same sentence.
"""
from __future__ import annotations

import datetime as _dt
import logging
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.tdi_rate_filings_constants import (
    CLOSED_TYPE_IN_FORCE,
    CLOSED_TYPES_ABANDONED,
    DWELLING_SUBTYPE,
    FETCH_TIMEOUT_SECONDS,
    FILINGS_CACHE_TTL_SECONDS,
    MAX_FILINGS_FETCHED,
    STATUS_CLOSED,
    STATUS_PENDING,
    TDI_RATE_FILINGS_URL,
)
from app.schemas.insurance.insurance_rate_filing import InsuranceRateFiling

logger = logging.getLogger(__name__)


class RateFilingFeedUnavailableError(RuntimeError):
    """The dataset could not be reached or returned something unusable."""


# Process-local, holds nothing user-specific, needs no invalidation story.
_cache: tuple[float, list[InsuranceRateFiling]] | None = None


def _user_agent() -> str:
    base = settings.app_url or "https://mybookkeeper.app"
    return f"MyBookkeeper-InsuranceRateWatch/1.0 ({base})"


def _parse_date(raw: Any) -> _dt.date | None:
    """Socrata floating timestamps look like ``2026-09-01T00:00:00.000``."""
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return _dt.date.fromisoformat(raw[:10])
    except ValueError:
        return None


def _parse_percent(raw: Any) -> float | None:
    """``"   11.1%"`` -> ``11.1``.

    The column is a padded display string, not a number, and carries a sign for
    decreases. A filing with no stated change yields None rather than 0.0 —
    "not stated" and "held flat" are different facts, and only the second is
    something to tell an operator.
    """
    if not isinstance(raw, str):
        return None
    cleaned = raw.strip().rstrip("%").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _to_filing(row: dict[str, Any]) -> InsuranceRateFiling | None:
    """Map one dataset row, or None when it is unusable.

    A filing's disposition decides whether it is reported as real. ``Closed`` +
    ``Reviewed`` means the rate is in force. ``Withdrawn`` and ``Rejected``
    closed without ever applying, so they are carried with ``is_in_force``
    false and filtered upstream — dropping them here would leave no way to
    explain a carrier that filed and then backed down.
    """
    serff_id = str(row.get("serff_id") or "").strip()
    company_name = str(row.get("company_name") or "").strip()
    if not serff_id or not company_name:
        return None

    status = str(row.get("status") or "").strip()
    closed_type = str(row.get("closed_type") or "").strip()

    is_pending = status == STATUS_PENDING
    is_in_force = (
        status == STATUS_CLOSED
        and closed_type == CLOSED_TYPE_IN_FORCE
        and closed_type not in CLOSED_TYPES_ABANDONED
    )

    return InsuranceRateFiling(
        serff_id=serff_id,
        company_name=company_name,
        product_name=str(row.get("product_name") or "").strip() or None,
        percent_change=_parse_percent(row.get("percent_change")),
        filed_date=_parse_date(row.get("received_date")),
        effective_date_renewal=_parse_date(row.get("effective_date_renewal")),
        is_in_force=is_in_force,
        is_pending=is_pending,
    )


async def fetch_dwelling_filings() -> list[InsuranceRateFiling]:
    """Every dwelling-line filing TDI publishes, newest first.

    The whole line is ~700 rows, so it is fetched once and filtered in memory:
    the per-policy carrier match and the market view both read the same list,
    and splitting them into two queries would double the calls to TDI for no
    gain.
    """
    global _cache

    if _cache is not None and (time.monotonic() - _cache[0]) < FILINGS_CACHE_TTL_SECONDS:
        return _cache[1]

    params = {
        "$where": f"state_subtype_of_insurance='{DWELLING_SUBTYPE}'",
        "$order": "received_date DESC",
        "$limit": str(MAX_FILINGS_FETCHED),
    }

    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_SECONDS) as client:
            response = await client.get(
                TDI_RATE_FILINGS_URL,
                params=params,
                headers={"User-Agent": _user_agent(), "Accept": "application/json"},
                follow_redirects=True,
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        # Per rules/check-third-party-error-codes.md: Socrata puts the reason a
        # query was refused in the body, so log it rather than only the status.
        logger.warning(
            "TDI rate filings returned HTTP %s: %s",
            exc.response.status_code,
            exc.response.text[:200],
        )
        raise RateFilingFeedUnavailableError("rate filing feed returned an error") from exc
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("TDI rate filings unreachable: %s", exc)
        raise RateFilingFeedUnavailableError("rate filing feed is unreachable") from exc

    if not isinstance(payload, list):
        raise RateFilingFeedUnavailableError("rate filing feed returned an unexpected shape")

    filings = [
        filing
        for filing in (_to_filing(row) for row in payload if isinstance(row, dict))
        if filing is not None
    ]
    _cache = (time.monotonic(), filings)
    return filings
