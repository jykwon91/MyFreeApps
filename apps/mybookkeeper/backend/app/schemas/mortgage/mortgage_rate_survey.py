"""The pair of survey readings a comparison chooses between."""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.mortgage.mortgage_rate_observation import MortgageRateObservation


class MortgageRateSurvey(BaseModel):
    """Freddie Mac's latest 30-year and 15-year fixed averages."""

    thirty_year: MortgageRateObservation
    fifteen_year: MortgageRateObservation

    def for_term(self, remaining_months: int) -> MortgageRateObservation:
        """The series a loan with this much left should be measured against.

        Only two terms are priced, so the choice is which one a refinance would
        realistically be written at. A loan with more than fifteen years to run
        is compared to the 30-year average; anything shorter is compared to the
        15-year, because refinancing eleven years of payments into a fresh
        thirty is not the same transaction and is priced differently.
        """
        return (
            self.thirty_year
            if remaining_months > self.fifteen_year.term_months
            else self.fifteen_year
        )
