"""Fetch residential electricity offers from the Power to Choose feed.

Network boundary only: this module talks to the PUCT host and turns the raw
payload into ``UtilityOffer`` rows. Which offers are worth showing, and how they
compare to what a property already pays, is decided in
``utility_offer_service`` — nothing here reads the database.
"""
from __future__ import annotations

import logging
import time
from decimal import Decimal
from typing import Any

import httpx

from app.core.config import settings
from app.core.power_to_choose_constants import (
    FEED_RATE_TYPE_FIXED,
    OFFER_CACHE_TTL_SECONDS,
    OFFER_FETCH_TIMEOUT_SECONDS,
    POWER_TO_CHOOSE_PLANS_URL,
)
from app.schemas.properties.utility_offer import UtilityOffer
from app.services.properties._offer_ranking import (
    clean_special_terms,
    is_teaser_priced,
    normalize_rating,
    parse_cancellation_fee_cents,
)

logger = logging.getLogger(__name__)


class OfferFeedUnavailableError(RuntimeError):
    """The feed could not be reached or returned something unusable."""


# The ZIP is deliberately absent from every log line below. Application logs
# ship to Sentry, and a ZIP tied to an organization is location data about the
# operator's properties — while adding nothing to a diagnosis, because a feed
# failure is regional and the operator already sees which property couldn't be
# priced: ``utility_offer_service`` turns the raised error into a per-group
# reason on the page. What the logs carry instead is what the third-party
# response actually said.


# ZIP -> (fetched_at_monotonic, offers). The feed republishes in daily batches,
# so within the TTL every caller for a ZIP can share one fetch. Process-local by
# design: it holds nothing user-specific and needs no invalidation story.
_cache: dict[str, tuple[float, list[UtilityOffer]]] = {}


def _user_agent() -> str:
    base = settings.app_url or "https://mybookkeeper.app"
    return f"MyBookkeeper-UtilityOffers/1.0 ({base})"


def _decimal(raw: Any) -> Decimal | None:
    if raw is None:
        return None
    try:
        return Decimal(str(raw))
    except (ArithmeticError, ValueError):
        return None


def _to_offer(row: dict[str, Any]) -> UtilityOffer | None:
    """Map one feed row, or None when it is unusable.

    Only ``Fixed`` offers survive: a variable-rate offer is the holdover product
    a lapsed plan already fell into, so presenting it as an upgrade would be
    incoherent. Prepaid is dropped too — it is a different product, bought under
    a deposit-and-credit constraint rather than on price.

    Time-of-use offers (free nights, free weekends, off-peak discounts) are
    kept, flagged, and left for the caller to present separately. Their
    disclosure prices are a blended average over an assumed usage shape, so they
    cannot be ranked against a flat rate — but dropping them here made a whole
    category of plan invisible, including well-rated ones, and an optimiser that
    silently never considers a product is worse than one that shows it plainly
    with no saving claimed.
    """
    if row.get("rate_type") != FEED_RATE_TYPE_FIXED:
        return None
    if row.get("prepaid"):
        return None

    is_time_of_use = bool(row.get("timeofuse"))

    price_500 = _decimal(row.get("price_kwh500"))
    price_1000 = _decimal(row.get("price_kwh1000"))
    price_2000 = _decimal(row.get("price_kwh2000"))
    if price_500 is None or price_1000 is None or price_2000 is None:
        return None
    if price_1000 <= 0:
        return None

    plan_id = row.get("plan_id")
    term = row.get("term_value")
    if not isinstance(plan_id, int) or not isinstance(term, int):
        return None

    fee_cents, fee_per_month = parse_cancellation_fee_cents(row.get("pricing_details"))

    return UtilityOffer(
        external_plan_id=plan_id,
        provider_name=str(row.get("company_name") or "").strip() or "Unknown provider",
        plan_name=str(row.get("plan_name") or "").strip() or "Unnamed plan",
        term_months=term,
        price_cents_per_kwh_at_500=price_500,
        price_cents_per_kwh_at_1000=price_1000,
        price_cents_per_kwh_at_2000=price_2000,
        renewable_pct=row.get("renewable_energy_id")
        if isinstance(row.get("renewable_energy_id"), int)
        else None,
        provider_rating=normalize_rating(row.get("rating_total")),
        jd_power_rating=normalize_rating(row.get("jdp_rating")),
        cancellation_fee_cents=fee_cents,
        cancellation_fee_is_per_remaining_month=fee_per_month,
        is_teaser_priced=is_teaser_priced(price_500, price_1000, price_2000),
        is_time_of_use=is_time_of_use,
        # Only carried for time-of-use plans: on a flat plan the field is
        # marketing copy that adds nothing to a price comparison, whereas here
        # it is the only place the free window is written down.
        special_terms=(
            clean_special_terms(row.get("special_terms")) if is_time_of_use else None
        ),
        fact_sheet_url=str(row.get("fact_sheet") or "") or None,
        enroll_url=str(row.get("go_to_plan") or "") or None,
    )


async def fetch_offers(zip_code: str) -> list[UtilityOffer]:
    """Every usable fixed-rate offer published for ``zip_code``.

    Raises ``OfferFeedUnavailableError`` rather than returning an empty list on
    failure: "the feed is down" and "there are no offers here" lead to different
    words on screen, and collapsing them would quietly tell the operator they
    have nothing to switch to.
    """
    cached = _cache.get(zip_code)
    if cached is not None and (time.monotonic() - cached[0]) < OFFER_CACHE_TTL_SECONDS:
        return cached[1]

    try:
        async with httpx.AsyncClient(timeout=OFFER_FETCH_TIMEOUT_SECONDS) as client:
            response = await client.get(
                POWER_TO_CHOOSE_PLANS_URL,
                params={"zip_code": zip_code},
                headers={"User-Agent": _user_agent(), "Accept": "application/json"},
                follow_redirects=True,
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Power to Choose returned HTTP %s: %s",
            exc.response.status_code,
            exc.response.text[:200],
        )
        raise OfferFeedUnavailableError("offer feed returned an error") from exc
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Power to Choose unreachable: %s", exc)
        raise OfferFeedUnavailableError("offer feed is unreachable") from exc

    if not isinstance(payload, dict) or not payload.get("success"):
        logger.warning(
            "Power to Choose reported failure: %s",
            (payload or {}).get("message") if isinstance(payload, dict) else None,
        )
        raise OfferFeedUnavailableError("offer feed reported a failure")

    rows = payload.get("data")
    if not isinstance(rows, list):
        raise OfferFeedUnavailableError("offer feed returned an unexpected shape")

    offers = [
        offer
        for offer in (_to_offer(row) for row in rows if isinstance(row, dict))
        if offer is not None
    ]
    _cache[zip_code] = (time.monotonic(), offers)
    return offers
