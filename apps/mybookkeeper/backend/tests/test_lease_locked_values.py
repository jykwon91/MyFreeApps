"""What an added document may do to the values of a lease that is locked.

The saved values and dates are the record. New keys are saved, empty dates are
filled, and an override that disagrees with a saved value is refused.
"""
from __future__ import annotations

import datetime as _dt
from types import SimpleNamespace

import pytest

from app.services.leases.exceptions.lease_value_locked_error import LeaseValueLockedError
from app.services.leases.lease_addendum_values import merge_addendum_values

TODAY = _dt.date(2026, 1, 1)


def _lease(values: dict[str, str], *, starts_on=None, ends_on=None) -> SimpleNamespace:
    return SimpleNamespace(id="lease-1", values=values, starts_on=starts_on, ends_on=ends_on)


def _merge(lease, *, override=None, locked: bool = True):
    return merge_addendum_values(
        lease=lease, placeholders=[], override=override, applicant=None, inquiry=None,
        property_record=None, user_record=None, today=TODAY, is_locked=locked,
    )


def test_a_new_key_is_saved_on_a_locked_lease() -> None:
    merged, fields = _merge(_lease({"RENT": "1000"}), override={"PET FEE": "50"})

    assert merged["PET FEE"] == "50"
    assert fields["values"] == {"RENT": "1000", "PET FEE": "50"}


def test_a_saved_value_is_never_overwritten_on_a_locked_lease() -> None:
    with pytest.raises(LeaseValueLockedError) as refused:
        _merge(_lease({"RENT": "1000"}), override={"RENT": "1200", "PET FEE": "50"})

    assert refused.value.keys == ["RENT"]


def test_an_override_equal_to_the_saved_value_is_not_a_change() -> None:
    _, fields = _merge(_lease({"RENT": "1000"}), override={"RENT": "1000"})

    assert fields == {}


def test_an_empty_saved_value_counts_as_a_new_key() -> None:
    _, fields = _merge(_lease({"RENT": ""}), override={"RENT": "1000"})

    assert fields["values"] == {"RENT": "1000"}


def test_empty_dates_are_filled_from_new_values_on_an_imported_lease() -> None:
    _, fields = _merge(_lease({}), override={"MOVE-IN DATE": "2026-02-01", "MOVE-OUT DATE": "2027-01-31"})

    assert (fields["starts_on"], fields["ends_on"]) == (_dt.date(2026, 2, 1), _dt.date(2027, 1, 31))


def test_saved_dates_are_never_overwritten_on_a_locked_lease() -> None:
    lease = _lease({}, starts_on=_dt.date(2025, 6, 1), ends_on=_dt.date(2026, 5, 31))

    _, fields = _merge(lease, override={"MOVE-IN DATE": "2026-02-01", "MOVE-OUT DATE": "2027-01-31"})

    assert "starts_on" not in fields and "ends_on" not in fields
    assert fields["values"]["MOVE-IN DATE"] == "2026-02-01"


def test_an_open_lease_takes_every_override() -> None:
    merged, fields = _merge(_lease({"RENT": "1000"}), override={"RENT": "1200"}, locked=False)

    assert merged["RENT"] == "1200" and fields["values"] == {"RENT": "1200"}
