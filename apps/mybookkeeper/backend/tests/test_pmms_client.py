"""Parsing Freddie Mac's survey out of FRED's CSV export.

Every case here comes from the shape of the real file rather than from
imagination: the export carries the full history back to 1971, its columns are
ragged because the 15-year series only starts in 1991, and missing values
appear mid-history as ``.``.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

import pytest

from app.core.mortgage_enums import TERM_MONTHS_15_YEAR, TERM_MONTHS_30_YEAR
from app.services.mortgage.pmms_client import (
    MortgageRateFeedUnavailableError,
    parse_survey_csv,
)

TODAY = _dt.date(2026, 8, 17)

HEADER = "observation_date,MORTGAGE30US,MORTGAGE15US"


def _csv(*rows: str) -> str:
    return "\n".join([HEADER, *rows]) + "\n"


class TestParseSurveyCsv:
    def test_takes_the_newest_row(self) -> None:
        survey = parse_survey_csv(
            _csv("2026-08-06,6.70,5.99", "2026-08-13,6.67,5.96"),
            today=TODAY,
        )
        assert survey.thirty_year.rate_pct == Decimal("6.67")
        assert survey.fifteen_year.rate_pct == Decimal("5.96")
        assert survey.thirty_year.observed_on == _dt.date(2026, 8, 13)
        assert survey.thirty_year.term_months == TERM_MONTHS_30_YEAR
        assert survey.fifteen_year.term_months == TERM_MONTHS_15_YEAR

    def test_each_series_is_scanned_independently(self) -> None:
        """Ragged columns are the export's normal shape, not a corruption.

        Reading "the last row" for both series works most weeks and silently
        breaks the week either one misses a publication.
        """
        survey = parse_survey_csv(
            _csv("2026-08-06,6.70,5.99", "2026-08-13,6.67,"),
            today=TODAY,
        )
        assert survey.thirty_year.rate_pct == Decimal("6.67")
        assert survey.thirty_year.observed_on == _dt.date(2026, 8, 13)
        # The younger series keeps its own last real reading and its own date.
        assert survey.fifteen_year.rate_pct == Decimal("5.99")
        assert survey.fifteen_year.observed_on == _dt.date(2026, 8, 6)

    def test_dot_is_fred_s_null_and_is_not_a_rate(self) -> None:
        survey = parse_survey_csv(
            _csv("2026-08-06,6.70,5.99", "2026-08-13,6.67,."),
            today=TODAY,
        )
        assert survey.fifteen_year.rate_pct == Decimal("5.99")

    def test_out_of_order_rows_do_not_move_the_answer_backwards(self) -> None:
        survey = parse_survey_csv(
            _csv("2026-08-13,6.67,5.96", "2026-08-06,6.70,5.99"),
            today=TODAY,
        )
        assert survey.thirty_year.rate_pct == Decimal("6.67")

    def test_a_stale_survey_is_an_outage_not_an_answer(self) -> None:
        """Better to say nothing was checked than to compare a live loan
        against a figure from last quarter."""
        with pytest.raises(MortgageRateFeedUnavailableError):
            parse_survey_csv(_csv("2026-05-01,6.70,5.99"), today=TODAY)

    def test_a_series_with_no_usable_value_raises(self) -> None:
        with pytest.raises(MortgageRateFeedUnavailableError):
            parse_survey_csv(_csv("2026-08-13,6.67,."), today=TODAY)

    def test_a_missing_column_raises(self) -> None:
        """A renamed or dropped series is a code bug, not a market signal."""
        body = "observation_date,MORTGAGE30US\n2026-08-13,6.67\n"
        with pytest.raises(MortgageRateFeedUnavailableError):
            parse_survey_csv(body, today=TODAY)

    def test_an_empty_document_raises(self) -> None:
        with pytest.raises(MortgageRateFeedUnavailableError):
            parse_survey_csv("", today=TODAY)

    def test_junk_rows_are_skipped_rather_than_fatal(self) -> None:
        survey = parse_survey_csv(
            _csv(",,", "not-a-date,6.99,6.10", "2026-08-13,6.67,5.96"),
            today=TODAY,
        )
        assert survey.thirty_year.rate_pct == Decimal("6.67")

    def test_a_non_positive_rate_is_not_a_reading(self) -> None:
        survey = parse_survey_csv(
            _csv("2026-08-06,6.70,5.99", "2026-08-13,0,5.96"),
            today=TODAY,
        )
        assert survey.thirty_year.rate_pct == Decimal("6.70")


class TestForTerm:
    def test_a_long_loan_gets_the_30_year(self) -> None:
        survey = parse_survey_csv(_csv("2026-08-13,6.67,5.96"), today=TODAY)
        assert survey.for_term(343).term_months == TERM_MONTHS_30_YEAR

    def test_a_loan_at_exactly_fifteen_years_gets_the_15_year(self) -> None:
        survey = parse_survey_csv(_csv("2026-08-13,6.67,5.96"), today=TODAY)
        assert survey.for_term(TERM_MONTHS_15_YEAR).term_months == TERM_MONTHS_15_YEAR
