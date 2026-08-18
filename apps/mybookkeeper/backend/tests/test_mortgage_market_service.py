"""The rate-watch service's orchestration.

The arithmetic is covered in ``test_refi_outlook.py``. What matters here is
what happens when Freddie Mac cannot be reached: every loan must still list,
each carrying the same explanation. A silent empty result would read as "your
rates are fine" when the truth is "nothing was checked", which is the failure
mode the insurance version shipped with.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.core.mortgage_enums import (
    RATE_TYPE_ARM,
    RATE_TYPE_FIXED,
    TERM_MONTHS_15_YEAR,
    TERM_MONTHS_30_YEAR,
    VERDICT_NOT_CHECKABLE,
)
from app.core.pmms_rate_constants import (
    REASON_FEED_UNAVAILABLE,
    SERIES_15_YEAR,
    SERIES_30_YEAR,
)
from app.models.mortgage.mortgage import Mortgage
from app.schemas.mortgage.mortgage_rate_observation import MortgageRateObservation
from app.schemas.mortgage.mortgage_rate_survey import MortgageRateSurvey
from app.services.mortgage import mortgage_rate_watch_service
from app.services.mortgage.pmms_client import MortgageRateFeedUnavailableError

TODAY = _dt.date(2026, 8, 17)

SURVEY = MortgageRateSurvey(
    thirty_year=MortgageRateObservation(
        series_id=SERIES_30_YEAR,
        term_months=TERM_MONTHS_30_YEAR,
        rate_pct=Decimal("6.67"),
        observed_on=_dt.date(2026, 8, 13),
    ),
    fifteen_year=MortgageRateObservation(
        series_id=SERIES_15_YEAR,
        term_months=TERM_MONTHS_15_YEAR,
        rate_pct=Decimal("5.96"),
        observed_on=_dt.date(2026, 8, 6),
    ),
)


def _pair(rate_type: str = RATE_TYPE_FIXED, classification: str = "investment"):
    mortgage = Mortgage(
        id=uuid.uuid4(),
        property_id=uuid.uuid4(),
        lender="TDECU",
        rate_type=rate_type,
        interest_rate=Decimal("7.125"),
        current_balance_cents=33613735,
        maturity_date=_dt.date(2055, 3, 17),
    )
    prop = SimpleNamespace(
        name="6734 Peerless",
        classification=SimpleNamespace(value=classification),
    )
    return mortgage, prop


async def _run(pairs):
    with patch(
        "app.services.mortgage.mortgage_rate_watch_service.unit_of_work",
    ), patch(
        "app.services.mortgage.mortgage_rate_watch_service.mortgage_repo"
        ".list_with_properties",
        new=AsyncMock(return_value=pairs),
    ):
        return await mortgage_rate_watch_service.get_rate_watch(
            user_id=uuid.uuid4(), organization_id=uuid.uuid4(), today=TODAY,
        )


class TestGetRateWatch:
    @pytest.mark.asyncio
    async def test_no_loans_never_touches_the_network(self) -> None:
        with patch(
            "app.services.mortgage.mortgage_rate_watch_service.fetch_rate_survey",
            new=AsyncMock(),
        ) as fetch:
            result = await _run([])
        assert result.outlooks == []
        assert result.checked_mortgage_count == 0
        assert not fetch.called

    @pytest.mark.asyncio
    async def test_compares_every_loan_and_echoes_the_benchmark(self) -> None:
        with patch(
            "app.services.mortgage.mortgage_rate_watch_service.fetch_rate_survey",
            new=AsyncMock(return_value=SURVEY),
        ):
            result = await _run([_pair(), _pair()])

        assert len(result.outlooks) == 2
        assert result.checked_mortgage_count == 2
        assert result.survey_30_year_pct == Decimal("6.67")
        assert result.survey_15_year_pct == Decimal("5.96")
        assert result.feed_unavailable_reason is None

    @pytest.mark.asyncio
    async def test_the_survey_date_is_the_newer_of_the_two_series(self) -> None:
        """The two series are read independently and can land on different
        weeks, so one shared date would be wrong for one of them."""
        with patch(
            "app.services.mortgage.mortgage_rate_watch_service.fetch_rate_survey",
            new=AsyncMock(return_value=SURVEY),
        ):
            result = await _run([_pair()])
        assert result.survey_observed_on == _dt.date(2026, 8, 13)

    @pytest.mark.asyncio
    async def test_an_uncheckable_loan_is_listed_but_not_counted(self) -> None:
        with patch(
            "app.services.mortgage.mortgage_rate_watch_service.fetch_rate_survey",
            new=AsyncMock(return_value=SURVEY),
        ):
            result = await _run([_pair(), _pair(rate_type=RATE_TYPE_ARM)])

        assert len(result.outlooks) == 2
        assert result.checked_mortgage_count == 1

    @pytest.mark.asyncio
    async def test_a_feed_outage_still_lists_every_loan(self) -> None:
        with patch(
            "app.services.mortgage.mortgage_rate_watch_service.fetch_rate_survey",
            new=AsyncMock(side_effect=MortgageRateFeedUnavailableError("down")),
        ):
            result = await _run([_pair(), _pair()])

        assert len(result.outlooks) == 2
        assert result.checked_mortgage_count == 0
        assert result.feed_unavailable_reason == REASON_FEED_UNAVAILABLE
        for outlook in result.outlooks:
            assert outlook.is_checkable is False
            assert outlook.verdict == VERDICT_NOT_CHECKABLE
            assert outlook.unavailable_reason == REASON_FEED_UNAVAILABLE

    @pytest.mark.asyncio
    async def test_an_outage_publishes_no_benchmark(self) -> None:
        """Nothing was measured, so there is no figure to claim it was
        measured against."""
        with patch(
            "app.services.mortgage.mortgage_rate_watch_service.fetch_rate_survey",
            new=AsyncMock(side_effect=MortgageRateFeedUnavailableError("down")),
        ):
            result = await _run([_pair()])
        assert result.survey_30_year_pct is None
        assert result.survey_observed_on is None
