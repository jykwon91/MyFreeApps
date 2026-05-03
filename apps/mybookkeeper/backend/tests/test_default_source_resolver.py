"""Unit tests for the default_source_resolver module.

Tests cover:
- resolve_default_source: applicant-only, inquiry fallback, both null,
  single-source (no ||), "today", date formatting
- validate_default_source_spec: valid chains accepted, arbitrary strings
  rejected, && rejected (only || supported), N>2 chain rejected
"""
from __future__ import annotations

import datetime
from unittest.mock import MagicMock

import pytest

from app.services.leases.default_source_resolver import (
    resolve_default_source,
    validate_default_source_spec,
)


# ---------------------------------------------------------------------------
# Helpers — minimal mock objects matching ORM column names
# ---------------------------------------------------------------------------

def _make_applicant(
    legal_name: str | None = None,
    employer_or_hospital: str | None = None,
    contract_start: datetime.date | None = None,
    contract_end: datetime.date | None = None,
) -> MagicMock:
    a = MagicMock()
    a.legal_name = legal_name
    a.employer_or_hospital = employer_or_hospital
    a.contract_start = contract_start
    a.contract_end = contract_end
    a.dob = None
    a.vehicle_make_model = None
    a.stage = "lead"
    a.referred_by = None
    a.pets = None
    return a


def _make_inquiry(
    inquirer_name: str | None = None,
    inquirer_email: str | None = None,
    inquirer_phone: str | None = None,
    inquirer_employer: str | None = None,
    desired_start_date: datetime.date | None = None,
    desired_end_date: datetime.date | None = None,
) -> MagicMock:
    i = MagicMock()
    i.inquirer_name = inquirer_name
    i.inquirer_email = inquirer_email
    i.inquirer_phone = inquirer_phone
    i.inquirer_employer = inquirer_employer
    i.desired_start_date = desired_start_date
    i.desired_end_date = desired_end_date
    return i


# ---------------------------------------------------------------------------
# resolve_default_source
# ---------------------------------------------------------------------------

class TestResolveDefaultSource:
    def test_single_applicant_source_returns_value_and_provenance(self) -> None:
        applicant = _make_applicant(legal_name="Jane Doe")
        value, prov = resolve_default_source("applicant.legal_name", applicant, None)
        assert value == "Jane Doe"
        assert prov == "applicant"

    def test_single_applicant_source_none_returns_none(self) -> None:
        applicant = _make_applicant(legal_name=None)
        value, prov = resolve_default_source("applicant.legal_name", applicant, None)
        assert value is None
        assert prov is None

    def test_inquiry_fallback_used_when_applicant_field_is_none(self) -> None:
        applicant = _make_applicant(legal_name=None)
        inquiry = _make_inquiry(inquirer_name="John Smith")
        value, prov = resolve_default_source(
            "applicant.legal_name || inquiry.inquirer_name", applicant, inquiry
        )
        assert value == "John Smith"
        assert prov == "inquiry"

    def test_applicant_wins_over_inquiry_when_both_present(self) -> None:
        applicant = _make_applicant(legal_name="Jane Doe")
        inquiry = _make_inquiry(inquirer_name="John Smith")
        value, prov = resolve_default_source(
            "applicant.legal_name || inquiry.inquirer_name", applicant, inquiry
        )
        assert value == "Jane Doe"
        assert prov == "applicant"

    def test_both_null_returns_none(self) -> None:
        applicant = _make_applicant(legal_name=None)
        inquiry = _make_inquiry(inquirer_name=None)
        value, prov = resolve_default_source(
            "applicant.legal_name || inquiry.inquirer_name", applicant, inquiry
        )
        assert value is None
        assert prov is None

    def test_inquiry_none_with_fallback_chain_returns_none(self) -> None:
        applicant = _make_applicant(legal_name=None)
        value, prov = resolve_default_source(
            "applicant.legal_name || inquiry.inquirer_name", applicant, None
        )
        assert value is None
        assert prov is None

    def test_today_returns_todays_date_as_iso_string(self) -> None:
        applicant = _make_applicant()
        value, prov = resolve_default_source("today", applicant, None)
        assert value == datetime.date.today().isoformat()
        assert prov == "today"

    def test_date_field_returned_as_iso_string(self) -> None:
        target_date = datetime.date(2026, 3, 1)
        applicant = _make_applicant(contract_start=target_date)
        value, prov = resolve_default_source("applicant.contract_start", applicant, None)
        assert value == "2026-03-01"
        assert prov == "applicant"

    def test_inquiry_email_no_applicant_field(self) -> None:
        """Email only exists on Inquiry — single inquiry source."""
        applicant = _make_applicant()
        inquiry = _make_inquiry(inquirer_email="tenant@example.com")
        value, prov = resolve_default_source("inquiry.inquirer_email", applicant, inquiry)
        assert value == "tenant@example.com"
        assert prov == "inquiry"

    def test_empty_string_treated_as_none_falls_through_to_fallback(self) -> None:
        applicant = _make_applicant(legal_name="")
        inquiry = _make_inquiry(inquirer_name="John Smith")
        value, prov = resolve_default_source(
            "applicant.legal_name || inquiry.inquirer_name", applicant, inquiry
        )
        assert value == "John Smith"
        assert prov == "inquiry"

    def test_date_fallback_to_inquiry_desired_start(self) -> None:
        target = datetime.date(2026, 6, 1)
        applicant = _make_applicant(contract_start=None)
        inquiry = _make_inquiry(desired_start_date=target)
        value, prov = resolve_default_source(
            "applicant.contract_start || inquiry.desired_start_date", applicant, inquiry
        )
        assert value == "2026-06-01"
        assert prov == "inquiry"


# ---------------------------------------------------------------------------
# validate_default_source_spec
# ---------------------------------------------------------------------------

class TestValidateDefaultSourceSpec:
    def test_valid_single_applicant_path(self) -> None:
        validate_default_source_spec("applicant.legal_name")  # must not raise

    def test_valid_single_inquiry_path(self) -> None:
        validate_default_source_spec("inquiry.inquirer_email")  # must not raise

    def test_valid_today(self) -> None:
        validate_default_source_spec("today")  # must not raise

    def test_valid_chain_with_spaces(self) -> None:
        validate_default_source_spec(
            "applicant.legal_name || inquiry.inquirer_name"
        )  # must not raise

    def test_valid_chain_without_spaces(self) -> None:
        validate_default_source_spec(
            "applicant.legal_name||inquiry.inquirer_name"
        )  # must not raise

    def test_n_greater_than_2_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="at most one"):
            validate_default_source_spec(
                "applicant.legal_name || inquiry.inquirer_name || today"
            )

    def test_arbitrary_string_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            validate_default_source_spec("some.random.path")

    def test_and_and_operator_raises_value_error(self) -> None:
        """&& is not supported — only ||."""
        with pytest.raises(ValueError):
            validate_default_source_spec("applicant.legal_name && inquiry.inquirer_name")

    def test_unknown_applicant_field_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Unknown applicant field"):
            validate_default_source_spec("applicant.nonexistent_field")

    def test_unknown_inquiry_field_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Unknown inquiry field"):
            validate_default_source_spec("inquiry.nonexistent_field")

    def test_blank_spec_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            validate_default_source_spec("")

    def test_whitespace_only_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            validate_default_source_spec("   ")
