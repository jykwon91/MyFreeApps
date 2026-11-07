"""The minimum-age check on promotion uses the host's date, not the server's."""
from __future__ import annotations

import datetime as _dt

import pytest
from pydantic import ValidationError

from app.core.applicant_constants import APPLICANT_MINIMUM_AGE_YEARS
from app.schemas.applicants.applicant_promote_request import ApplicantPromoteRequest

_UTC_TODAY = _dt.datetime.now(_dt.timezone.utc).date()


def _turns_of_age_on(day: _dt.date) -> _dt.date:
    year = day.year - APPLICANT_MINIMUM_AGE_YEARS
    try:
        return day.replace(year=year)
    except ValueError:  # 29 February in a year without one
        return day.replace(year=year, day=28)


def test_today_is_required() -> None:
    with pytest.raises(ValidationError) as exc:
        ApplicantPromoteRequest()
    assert [(e["type"], e["loc"]) for e in exc.value.errors()] == [("missing", ("today",))]


@pytest.mark.parametrize("skew_days", [2, -2])
def test_rejects_a_date_that_cannot_be_the_hosts(skew_days: int) -> None:
    with pytest.raises(ValidationError):
        ApplicantPromoteRequest(today=_UTC_TODAY + _dt.timedelta(days=skew_days))


def test_an_applicant_whose_birthday_is_the_hosts_today_is_old_enough() -> None:
    hosts_today = _UTC_TODAY + _dt.timedelta(days=1)
    request = ApplicantPromoteRequest(
        today=hosts_today, dob=_turns_of_age_on(hosts_today),
    )
    assert request.dob == _turns_of_age_on(hosts_today)


def test_an_applicant_whose_birthday_is_after_the_hosts_today_is_too_young() -> None:
    # Old enough by the server's UTC date, a day short by the host's.
    hosts_today = _UTC_TODAY - _dt.timedelta(days=1)
    dob = _turns_of_age_on(hosts_today) + _dt.timedelta(days=1)
    with pytest.raises(ValidationError, match="at least"):
        ApplicantPromoteRequest(today=hosts_today, dob=dob)
