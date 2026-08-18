"""Compare every recorded loan against Freddie Mac's weekly survey.

Orchestration only: load the loans, fetch the survey, hand each pair to the
pure builder in ``_refi_outlook``. The arithmetic and the verdict live there so
they can be tested against a real statement without a database or a network.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from app.core.pmms_rate_constants import REASON_FEED_UNAVAILABLE
from app.core.mortgage_enums import VERDICT_NOT_CHECKABLE
from app.db.session import unit_of_work
from app.repositories.mortgage import mortgage_repo
from app.schemas.mortgage.mortgage_rate_watch_response import (
    MortgageRateWatchResponse,
)
from app.schemas.mortgage.mortgage_refi_outlook import MortgageRefiOutlook
from app.services.mortgage._refi_outlook import build_refi_outlook
from app.services.mortgage.pmms_client import (
    MortgageRateFeedUnavailableError,
    fetch_rate_survey,
)

logger = logging.getLogger(__name__)


def _feed_down_outlook(mortgage, property_name: str) -> MortgageRefiOutlook:
    return MortgageRefiOutlook(
        mortgage_id=mortgage.id,
        property_id=mortgage.property_id,
        property_name=property_name,
        lender=mortgage.lender,
        rate_type=mortgage.rate_type,
        current_rate_pct=mortgage.interest_rate,
        current_balance_cents=mortgage.current_balance_cents,
        is_checkable=False,
        unavailable_reason=REASON_FEED_UNAVAILABLE,
        verdict=VERDICT_NOT_CHECKABLE,
    )


async def get_rate_watch(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    today: _dt.date | None = None,
) -> MortgageRateWatchResponse:
    as_of = today or _dt.date.today()

    async with unit_of_work() as db:
        pairs = await mortgage_repo.list_with_properties(
            db, user_id=user_id, organization_id=organization_id,
        )

    if not pairs:
        return MortgageRateWatchResponse()

    try:
        survey = await fetch_rate_survey(today=as_of)
    except MortgageRateFeedUnavailableError as exc:
        logger.warning("mortgage rate watch could not reach the survey: %s", exc)
        return MortgageRateWatchResponse(
            outlooks=[
                _feed_down_outlook(mortgage, prop.name)
                for mortgage, prop in pairs
            ],
            feed_unavailable_reason=REASON_FEED_UNAVAILABLE,
        )

    outlooks = [
        build_refi_outlook(
            mortgage,
            property_name=prop.name,
            # ``Property.classification`` is a native enum column, so the
            # member's value is what the occupancy table is keyed by.
            classification=prop.classification.value,
            survey=survey,
            today=as_of,
        )
        for mortgage, prop in pairs
    ]

    return MortgageRateWatchResponse(
        outlooks=outlooks,
        survey_30_year_pct=survey.thirty_year.rate_pct,
        survey_15_year_pct=survey.fifteen_year.rate_pct,
        survey_observed_on=max(
            survey.thirty_year.observed_on, survey.fifteen_year.observed_on,
        ),
        checked_mortgage_count=sum(1 for o in outlooks if o.is_checkable),
    )
