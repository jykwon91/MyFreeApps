"""Anthropic Admin Cost Report API client — month-to-date org spend.

Pulls the organization's spend from the Admin Cost Report API
(``GET https://api.anthropic.com/v1/organizations/cost_report``), summed
over the current month, returned as integer cents.

Contract (verified against the Claude API reference, anthropic-version
2023-06-01):

- Auth header is ``x-api-key`` with an ADMIN key (``sk-ant-admin...``) —
  distinct from a normal API key. Also send ``anthropic-version``.
- Query: ``starting_at`` (RFC-3339, required), ``bucket_width=1d``,
  ``ending_at`` optional, ``limit``, and ``page`` for pagination
  (``has_more`` / ``next_page``).
- Response: ``{ data: [ { results: [ { amount, currency, ... } ] } ],
  has_more, next_page }``. CRUCIAL: ``amount`` is a decimal string in the
  LOWEST currency unit (cents) — e.g. ``"123.45"`` USD means $1.23. So
  summing the raw ``amount`` decimals already yields cents; we round the
  total to an int at the end.

Per rules/check-third-party-error-codes.md: on a non-success response we
capture the provider's structured error (``error.type`` / ``error.message``),
log it at WARNING, and raise :class:`AnthropicCostError` rather than
returning a bare 0 — a silent 0 would read as "no spend" and make the
widget claim costs are covered when the poll actually failed.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

import httpx

logger = logging.getLogger(__name__)

COST_REPORT_URL = "https://api.anthropic.com/v1/organizations/cost_report"
ANTHROPIC_VERSION = "2023-06-01"
COST_REPORT_TIMEOUT_S = 30.0
# A month has at most 31 daily buckets; 40 leaves headroom while keeping a
# single page the common case. Pagination still runs if has_more is set.
_PAGE_LIMIT = 40
# Hard stop on pagination so a misbehaving has_more can't loop forever.
_MAX_PAGES = 12


class AnthropicCostError(RuntimeError):
    """Raised when the Anthropic Cost Report API call fails.

    Distinct from "spend is zero": the caller (cost sync) logs this and
    SKIPS the cost update for the cycle, leaving the previously stored value
    intact rather than zeroing it out on a transient API blip.
    """


def _rfc3339(moment: datetime) -> str:
    """Format a datetime as an RFC-3339 UTC timestamp (``...Z``)."""
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _sum_page_cents(data: list) -> Decimal:
    """Sum every ``results[].amount`` across the buckets in one page.

    ``amount`` is already in cents (decimal string), so this returns cents.
    Malformed entries are skipped defensively — one bad row shouldn't sink
    the whole month's total.
    """
    total = Decimal(0)
    for bucket in data or []:
        for item in bucket.get("results", []) or []:
            raw = item.get("amount")
            if raw is None:
                continue
            try:
                total += Decimal(str(raw))
            except (ValueError, ArithmeticError):
                logger.warning("Anthropic cost item had unparseable amount: %r", raw)
    return total


async def fetch_cost_cents(
    *,
    api_key: str,
    starting_at: datetime,
    ending_at: datetime | None = None,
) -> int:
    """Return total Anthropic org spend in integer cents from ``starting_at``.

    An empty ``api_key`` short-circuits to ``0`` WITHOUT a network call — the
    documented "operator declined the admin key" mode, mirroring the
    Turnstile dev-mode no-op. The caller then reports costs from the fixed
    monthly constants alone.

    Raises :class:`AnthropicCostError` on any network error or non-2xx
    response (after logging the provider's structured error context).
    """
    if not api_key:
        return 0

    params: dict[str, str] = {
        "starting_at": _rfc3339(starting_at),
        "bucket_width": "1d",
        "limit": str(_PAGE_LIMIT),
    }
    if ending_at is not None:
        params["ending_at"] = _rfc3339(ending_at)

    headers = {"x-api-key": api_key, "anthropic-version": ANTHROPIC_VERSION}

    total_cents = Decimal(0)
    async with httpx.AsyncClient(timeout=COST_REPORT_TIMEOUT_S) as client:
        page: str | None = None
        for _ in range(_MAX_PAGES):
            page_params = dict(params)
            if page:
                page_params["page"] = page
            try:
                resp = await client.get(
                    COST_REPORT_URL, params=page_params, headers=headers,
                )
            except httpx.RequestError as exc:
                raise AnthropicCostError(
                    f"Anthropic Cost Report request failed: {exc}",
                ) from exc

            if resp.status_code != 200:
                _log_error_response(resp)
                raise AnthropicCostError(
                    f"Anthropic Cost Report returned HTTP {resp.status_code}",
                )

            body = resp.json()
            total_cents += _sum_page_cents(body.get("data", []))

            if not body.get("has_more"):
                break
            page = body.get("next_page")
            if not page:
                break

    return int(total_cents.to_integral_value(rounding=ROUND_HALF_UP))


def _log_error_response(resp: httpx.Response) -> None:
    """Log the provider's structured error context at WARNING.

    Anthropic error bodies are ``{"type":"error","error":{"type":..,
    "message":..}}``. We surface ``error.type`` + ``error.message`` so log
    aggregation can group by failure reason (auth vs rate-limit vs invalid
    request) instead of seeing only an opaque status code.
    """
    error_type = ""
    message = ""
    try:
        payload = resp.json()
        err = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(err, dict):
            error_type = str(err.get("type") or "")
            message = str(err.get("message") or "")
    except (ValueError, AttributeError):
        message = resp.text[:200]
    logger.warning(
        "Anthropic Cost Report failed: status=%s error_type=%s message=%s",
        resp.status_code,
        error_type,
        message,
    )


__all__ = ["AnthropicCostError", "fetch_cost_cents", "COST_REPORT_URL"]
