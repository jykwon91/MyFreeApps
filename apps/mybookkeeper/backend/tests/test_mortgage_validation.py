"""Cross-field validation on the mortgage payloads.

These rules mirror the ``mortgages`` CHECK constraints at the edge so a bad
payload fails as a readable 422 rather than a 500 from an IntegrityError deeper
in the stack. The database remains the real guarantee.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.core.mortgage_enums import RATE_TYPE_ARM, RATE_TYPE_FIXED
from app.schemas.mortgage.mortgage_create_request import MortgageCreateRequest
from app.schemas.mortgage.mortgage_update_request import MortgageUpdateRequest
from app.schemas.mortgage.mortgage_validation import validate_mortgage_fields

PROPERTY_ID = uuid.uuid4()


def _create(**overrides) -> MortgageCreateRequest:
    fields = {"property_id": PROPERTY_ID, "rate_type": RATE_TYPE_FIXED}
    fields.update(overrides)
    return MortgageCreateRequest(**fields)


class TestCreateRequest:
    def test_minimal_payload_is_just_a_property_and_a_rate_type(self) -> None:
        request = _create()
        assert request.rate_type == RATE_TYPE_FIXED
        assert request.interest_rate is None

    def test_rate_type_has_no_default(self) -> None:
        """The one thing the comparison cannot infer, so the form has to ask."""
        with pytest.raises(ValidationError):
            MortgageCreateRequest(property_id=PROPERTY_ID)

    def test_an_unknown_rate_type_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            _create(rate_type="variable")

    def test_a_reset_date_on_a_fixed_loan_is_rejected(self) -> None:
        """It would read as a rate change that is never coming."""
        with pytest.raises(ValidationError):
            _create(rate_type=RATE_TYPE_FIXED, fixed_until=_dt.date(2035, 2, 1))

    def test_a_reset_date_on_an_arm_is_accepted(self) -> None:
        request = _create(
            rate_type=RATE_TYPE_ARM, fixed_until=_dt.date(2035, 2, 1),
        )
        assert request.fixed_until == _dt.date(2035, 2, 1)

    def test_a_balance_without_its_date_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            _create(current_balance_cents=33613735)

    def test_a_date_without_its_balance_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            _create(statement_date=_dt.date(2026, 8, 1))

    def test_the_pair_together_is_accepted(self) -> None:
        request = _create(
            current_balance_cents=33613735,
            statement_date=_dt.date(2026, 8, 1),
        )
        assert request.current_balance_cents == 33613735

    def test_a_rate_outside_the_column_range_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            _create(interest_rate=Decimal("0"))
        with pytest.raises(ValidationError):
            _create(interest_rate=Decimal("25"))

    def test_a_term_beyond_fifty_years_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            _create(term_months=601)


class TestUpdateRequest:
    def test_an_empty_patch_is_valid(self) -> None:
        assert MortgageUpdateRequest().model_dump(exclude_unset=True) == {}

    def test_an_unknown_rate_type_is_still_rejected(self) -> None:
        with pytest.raises(ValidationError):
            MortgageUpdateRequest(rate_type="variable")

    def test_a_lone_balance_is_allowed_on_a_patch(self) -> None:
        """An absent field means "unchanged", not "null".

        The paired rules would misread the absent half as a cleared one. The
        service re-runs them against the merged row, which is where they bite.
        """
        patch = MortgageUpdateRequest(current_balance_cents=33613735)
        assert patch.current_balance_cents == 33613735


class TestValidateMortgageFields:
    def test_partial_mode_skips_the_paired_rules(self) -> None:
        patch = MortgageUpdateRequest(current_balance_cents=33613735)
        assert validate_mortgage_fields(patch, partial=True) is patch

    def test_full_mode_enforces_them(self) -> None:
        patch = MortgageUpdateRequest(current_balance_cents=33613735)
        with pytest.raises(ValueError, match="together"):
            validate_mortgage_fields(patch, partial=False)

    def test_full_mode_rejects_a_reset_date_on_a_fixed_loan(self) -> None:
        patch = MortgageUpdateRequest(
            rate_type=RATE_TYPE_FIXED, fixed_until=_dt.date(2035, 2, 1),
        )
        with pytest.raises(ValueError, match="adjustable"):
            validate_mortgage_fields(patch, partial=False)
