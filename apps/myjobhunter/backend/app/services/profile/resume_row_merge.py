"""Pure matching + fill rules for merging parsed resume rows into a profile.

A re-uploaded resume carries the same roles and degrees the profile already
holds. These helpers decide when a parsed row is "the same" as an existing
one, and which of the existing row's EMPTY fields the parsed row may fill.
They never overwrite a value that is already set, so text the user edited
by hand always survives a re-upload.
"""
from __future__ import annotations

from datetime import date

from app.models.profile.education import Education
from app.models.profile.work_history import WorkHistory

WorkHistoryKey = tuple[str, str, date]
EducationKey = tuple[str, str]


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def work_history_key(entry: WorkHistory) -> WorkHistoryKey:
    """Same company + same title + same start date = same role."""
    return (_normalize(entry.company_name), _normalize(entry.title), entry.start_date)


def education_key(entry: Education) -> EducationKey:
    """Same school + same degree = same degree entry."""
    return (_normalize(entry.school), _normalize(entry.degree))


def fill_empty_work_history_fields(existing: WorkHistory, parsed: WorkHistory) -> bool:
    """Copy parsed values into ``existing``'s empty fields. Returns True if any changed.

    ``end_date`` is only filled when the role is not marked current — a
    current role with an end date violates ``chk_work_history_current_no_end_date``,
    and the user's "current" flag is a set value, not an empty one.
    """
    changed = False
    if existing.end_date is None and not existing.is_current and parsed.end_date is not None:
        existing.end_date = parsed.end_date
        changed = True
    if not existing.bullets and parsed.bullets:
        existing.bullets = list(parsed.bullets)
        changed = True
    return changed


def fill_empty_education_fields(existing: Education, parsed: Education) -> bool:
    """Copy parsed values into ``existing``'s empty fields. Returns True if any changed.

    Year fills are applied only when the resulting pair still satisfies
    ``chk_education_end_year`` (end_year >= start_year).
    """
    changed = False
    if existing.field is None and parsed.field is not None:
        existing.field = parsed.field
        changed = True
    if existing.gpa is None and parsed.gpa is not None:
        existing.gpa = parsed.gpa
        changed = True

    start_year = existing.start_year if existing.start_year is not None else parsed.start_year
    end_year = existing.end_year if existing.end_year is not None else parsed.end_year
    years_valid = start_year is None or end_year is None or end_year >= start_year
    if years_valid and (start_year, end_year) != (existing.start_year, existing.end_year):
        existing.start_year = start_year
        existing.end_year = end_year
        changed = True
    return changed
