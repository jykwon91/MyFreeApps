"""Pure tests for the resume re-upload match + fill rules (no DB)."""
from __future__ import annotations

import uuid
from datetime import date

from app.models.profile.education import Education
from app.models.profile.work_history import WorkHistory
from app.services.profile.resume_row_merge import (
    education_key,
    fill_empty_education_fields,
    fill_empty_work_history_fields,
    work_history_key,
)

_USER_ID = uuid.uuid4()
_PROFILE_ID = uuid.uuid4()


def _work(**overrides: object) -> WorkHistory:
    values: dict[str, object] = {
        "user_id": _USER_ID,
        "profile_id": _PROFILE_ID,
        "company_name": "Acme Corp",
        "title": "Senior Engineer",
        "start_date": date(2020, 1, 1),
        "end_date": None,
        "is_current": False,
        "bullets": [],
    }
    values.update(overrides)
    return WorkHistory(**values)


def _edu(**overrides: object) -> Education:
    values: dict[str, object] = {
        "user_id": _USER_ID,
        "profile_id": _PROFILE_ID,
        "school": "State University",
        "degree": "B.S.",
        "field": None,
        "start_year": None,
        "end_year": None,
        "gpa": None,
    }
    values.update(overrides)
    return Education(**values)


class TestKeys:
    def test_work_key_ignores_case_and_surrounding_space(self) -> None:
        assert work_history_key(_work()) == work_history_key(
            _work(company_name="  acme corp ", title="SENIOR ENGINEER"),
        )

    def test_work_key_differs_on_start_date(self) -> None:
        assert work_history_key(_work()) != work_history_key(_work(start_date=date(2021, 1, 1)))

    def test_work_key_differs_on_title(self) -> None:
        assert work_history_key(_work()) != work_history_key(_work(title="Staff Engineer"))

    def test_education_key_ignores_case_and_space(self) -> None:
        assert education_key(_edu()) == education_key(_edu(school=" state university", degree="b.s. "))

    def test_education_key_treats_missing_degree_as_empty(self) -> None:
        assert education_key(_edu(degree=None)) == education_key(_edu(degree="  "))

    def test_education_key_differs_on_degree(self) -> None:
        assert education_key(_edu()) != education_key(_edu(degree="M.S."))


class TestFillWorkHistory:
    def test_fills_empty_end_date_and_bullets(self) -> None:
        existing = _work()
        parsed = _work(end_date=date(2023, 6, 1), bullets=["Shipped X"])
        assert fill_empty_work_history_fields(existing, parsed) is True
        assert existing.end_date == date(2023, 6, 1)
        assert existing.bullets == ["Shipped X"]

    def test_never_overwrites_set_values(self) -> None:
        existing = _work(end_date=date(2022, 1, 1), bullets=["My own wording"])
        parsed = _work(end_date=date(2023, 6, 1), bullets=["Parser wording"])
        assert fill_empty_work_history_fields(existing, parsed) is False
        assert existing.end_date == date(2022, 1, 1)
        assert existing.bullets == ["My own wording"]

    def test_current_role_gets_no_end_date(self) -> None:
        existing = _work(is_current=True)
        parsed = _work(end_date=date(2023, 6, 1))
        assert fill_empty_work_history_fields(existing, parsed) is False
        assert existing.end_date is None
        assert existing.is_current is True


class TestFillEducation:
    def test_fills_empty_fields(self) -> None:
        existing = _edu()
        parsed = _edu(field="CS", start_year=2016, end_year=2020, gpa=3.5)
        assert fill_empty_education_fields(existing, parsed) is True
        assert (existing.field, existing.start_year, existing.end_year, existing.gpa) == (
            "CS", 2016, 2020, 3.5,
        )

    def test_never_overwrites_set_values(self) -> None:
        existing = _edu(field="Computer Science", start_year=2015, end_year=2019, gpa=3.9)
        parsed = _edu(field="CS", start_year=2016, end_year=2020, gpa=3.5)
        assert fill_empty_education_fields(existing, parsed) is False
        assert (existing.field, existing.start_year, existing.end_year, existing.gpa) == (
            "Computer Science", 2015, 2019, 3.9,
        )

    def test_skips_year_fill_that_would_end_before_start(self) -> None:
        existing = _edu(end_year=2014)
        parsed = _edu(start_year=2016, end_year=2020)
        assert fill_empty_education_fields(existing, parsed) is False
        assert existing.start_year is None
        assert existing.end_year == 2014
