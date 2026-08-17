"""Tell the operator what the Texas dwelling market has filed against them.

Orchestration only: load the unexpired policies, pull the dwelling filings,
and hand both to the pure matcher. All data access goes through repositories;
this module never imports SQLAlchemy, and the arithmetic lives in
``_carrier_filing_match``.

Two outputs, answering two different questions. The per-policy outlook answers
"is my premium about to go up" — a filed increase reaches the operator months
before the renewal notice does. The market view answers "who should I call" —
a dwelling policy is agent-bound, so the useful thing to walk into that
conversation with is the list of carriers that just held their rates flat.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.tdi_rate_filings_constants import (
    MAX_MARKET_FILINGS,
    MIN_NOTABLE_CHANGE_PCT,
    REASON_FEED_DOWN,
    REASON_NO_CARRIER,
    REASON_NO_FILINGS,
    RENEWAL_HORIZON_DAYS,
)
from app.db.session import unit_of_work
from app.repositories.insurance import insurance_policy_repo
from app.repositories.properties import property_repo
from app.schemas.insurance.insurance_market_watch_response import (
    InsuranceMarketWatchResponse,
)
from app.schemas.insurance.insurance_policy_rate_outlook import (
    InsurancePolicyRateOutlook,
)
from app.schemas.insurance.insurance_rate_filing import InsuranceRateFiling
from app.services.insurance._carrier_filing_match import (
    applies_by,
    compound_change_pct,
    is_recent,
    matches_carrier,
    project_premium_cents,
)
from app.services.insurance.premium_math import annual_premium_cents
from app.services.insurance.tdi_rate_filings_client import (
    RateFilingFeedUnavailableError,
    fetch_dwelling_filings,
)

# Same ceiling the benchmark comparison uses: one operator's insurance
# portfolio is bounded by their number of properties, so this never pages.
_POLICY_PAGE_SIZE = 500


def _renewal_date(
    expiration_date: _dt.date | None, *, today: _dt.date,
) -> _dt.date:
    """When this policy next renews, assumed if not recorded."""
    if expiration_date is not None:
        return expiration_date
    return today + _dt.timedelta(days=RENEWAL_HORIZON_DAYS)


def _filings_for_policy(
    carrier: str | None,
    filings: list[InsuranceRateFiling],
    *,
    renewal: _dt.date,
    today: _dt.date,
) -> list[InsuranceRateFiling]:
    """This carrier's recent filings that are in effect by the renewal."""
    matched = [
        filing
        for filing in filings
        if matches_carrier(carrier, filing.company_name)
        and is_recent(filing, today=today)
        and applies_by(filing, renewal=renewal)
    ]
    matched.sort(key=lambda f: f.filed_date or _dt.date.min, reverse=True)
    return matched


def _build_outlook(
    row,
    *,
    property_name: str | None,
    filings: list[InsuranceRateFiling],
    today: _dt.date,
) -> InsurancePolicyRateOutlook:
    renewal = _renewal_date(row.expiration_date, today=today)
    matched = _filings_for_policy(
        row.carrier, filings, renewal=renewal, today=today,
    )

    unavailable_reason: str | None = None
    if not row.carrier:
        unavailable_reason = REASON_NO_CARRIER
    elif not matched:
        unavailable_reason = REASON_NO_FILINGS

    change_pct = compound_change_pct(matched)
    # Compared against the annualised premium, not the billed one: a monthly
    # premium projected forward would read as a twelfth of the real number.
    annual = annual_premium_cents(row.premium_cents, row.premium_frequency)

    return InsurancePolicyRateOutlook(
        policy_id=row.id,
        policy_name=row.policy_name,
        property_name=property_name,
        carrier=row.carrier,
        expiration_date=row.expiration_date,
        current_premium_cents=annual,
        filings=matched,
        projected_change_pct=change_pct,
        projected_premium_cents=project_premium_cents(annual, change_pct),
        unavailable_reason=unavailable_reason,
    )


def _market_view(
    filings: list[InsuranceRateFiling], *, today: _dt.date,
) -> list[InsuranceRateFiling]:
    """One row per carrier — their latest dwelling filing, newest first.

    Deduped by company because a carrier files several programs a year and the
    repeats would crowd out every other carrier in the list. Pending filings
    are kept: a proposed increase is exactly the signal that makes an operator
    shop early, and the schema flags it as proposed rather than in force.
    """
    latest: dict[str, InsuranceRateFiling] = {}
    for filing in filings:
        if not is_recent(filing, today=today):
            continue
        if not (filing.is_in_force or filing.is_pending):
            continue
        key = filing.company_name.upper()
        existing = latest.get(key)
        if existing is None or (filing.filed_date or _dt.date.min) > (
            existing.filed_date or _dt.date.min
        ):
            latest[key] = filing

    ordered = sorted(
        latest.values(),
        key=lambda f: f.filed_date or _dt.date.min,
        reverse=True,
    )
    return ordered[:MAX_MARKET_FILINGS]


def _is_expired(expiration_date: _dt.date | None, today: _dt.date) -> bool:
    """Matches the benchmark comparison: unknown end date is not a lapse."""
    return expiration_date is not None and expiration_date < today


async def get_market_watch(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    today: _dt.date | None = None,
) -> InsuranceMarketWatchResponse:
    """Rate outlook per unexpired policy, plus the recent dwelling market.

    A TDI outage degrades rather than fails, the way the utility offer search
    does: the policies still list, each saying the check could not be run. The
    one outcome that must never happen is rendering "no increases filed" when
    the truth is "nothing was checked".
    """
    reference = today or _dt.date.today()

    async with unit_of_work() as db:
        rows = await insurance_policy_repo.list_for_org(
            db,
            user_id=user_id,
            organization_id=organization_id,
            limit=_POLICY_PAGE_SIZE,
            offset=0,
        )
        names = await property_repo.get_name_map(db, organization_id)

    feed_unavailable_reason: str | None = None
    try:
        filings = await fetch_dwelling_filings()
    except RateFilingFeedUnavailableError:
        filings = []
        feed_unavailable_reason = REASON_FEED_DOWN

    outlooks = [
        _build_outlook(
            row,
            property_name=names.get(row.property_id),
            filings=filings,
            today=reference,
        )
        for row in rows
        if not _is_expired(row.expiration_date, reference)
    ]

    if feed_unavailable_reason is not None:
        for outlook in outlooks:
            outlook.unavailable_reason = feed_unavailable_reason

    # Soonest renewal first — the policy the operator can still do something
    # about reads before the one that renews in eleven months. Policies with no
    # recorded expiration sort last rather than being treated as overdue.
    outlooks.sort(key=lambda o: o.expiration_date or _dt.date.max)

    return InsuranceMarketWatchResponse(
        outlooks=outlooks,
        market_filings=_market_view(filings, today=reference),
        has_any_increase=any(
            outlook.projected_change_pct is not None
            and outlook.projected_change_pct >= MIN_NOTABLE_CHANGE_PCT
            for outlook in outlooks
        ),
        feed_unavailable_reason=feed_unavailable_reason,
    )
