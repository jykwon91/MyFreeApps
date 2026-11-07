"""The tax return request schema and table constraints share one set of allowed values."""
from typing import get_args

from app.core.tax_return_enums import FILING_STATUSES
from app.models.tax.tax_return import TaxReturn
from app.schemas.tax.filing_status import FilingStatus


def _constraint(name: str) -> str:
    return next(str(c.sqltext) for c in TaxReturn.__table__.constraints if c.name == name)


def test_filing_status_literal_matches_the_allowed_values() -> None:
    assert get_args(FilingStatus) == FILING_STATUSES


def test_table_constraints_are_unchanged_by_moving_the_values() -> None:
    assert _constraint("chk_return_year") == "tax_year >= 2020 AND tax_year <= 2099"
    assert _constraint("chk_return_filing") == (
        "filing_status IN ('single', 'married_filing_jointly', 'married_filing_separately', "
        "'head_of_household', 'qualifying_surviving_spouse')"
    )
    assert TaxReturn.__table__.c.jurisdiction.type.length == 50
