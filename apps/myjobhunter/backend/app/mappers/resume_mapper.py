"""Map Claude extraction output to WorkHistory / Education / Skill ORM instances.

All functions are pure — they take the parsed Claude dict and return model
instances ready to be bulk-inserted by the worker. They do NOT touch the
database directly. Callers are responsible for flushing/committing.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date

from app.models.profile.education import Education
from app.models.profile.skill import Skill
from app.models.profile.work_history import WorkHistory

logger = logging.getLogger(__name__)

# Maximum bullets per work history entry — mirrors the DB check constraint.
_MAX_BULLETS = 30

# Valid skill category values — mirrors the DB check constraint.
_VALID_SKILL_CATEGORIES: frozenset[str] = frozenset({
    "language", "framework", "tool", "platform", "soft",
})


def map_work_history(
    raw: list[dict],
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
) -> list[WorkHistory]:
    """Convert the ``work_history`` array from Claude output into model instances.

    Entries with missing ``company`` or ``title`` are skipped with a warning.
    Date parsing is lenient — partial dates (YYYY-MM) use the first of the month;
    unparseable values fall back to ``None`` with a warning.
    """
    entries: list[WorkHistory] = []
    for item in raw:
        company = (item.get("company") or "").strip()
        title = (item.get("title") or "").strip()
        if not company or not title:
            logger.warning("Skipping work_history entry with missing company/title: %r", item)
            continue

        start_date = _parse_date_partial(item.get("starts_on"), "starts_on")
        if start_date is None:
            # start_date is NOT NULL in the DB schema — fall back to a sentinel.
            logger.warning(
                "Work history entry for %r/%r has no parseable starts_on; "
                "using 1900-01-01 as sentinel",
                company, title,
            )
            start_date = date(1900, 1, 1)

        is_current = bool(item.get("is_current", False))
        ends_on_raw = item.get("ends_on")
        end_date: date | None = None
        if not is_current and ends_on_raw:
            end_date = _parse_date_partial(ends_on_raw, "ends_on")

        bullets_raw = item.get("bullets") or []
        bullets = [str(b).strip() for b in bullets_raw if str(b).strip()][:_MAX_BULLETS]

        entries.append(WorkHistory(
            user_id=user_id,
            profile_id=profile_id,
            company_name=company[:200],
            title=title[:200],
            start_date=start_date,
            end_date=end_date,
            bullets=bullets,
        ))
    return entries


def map_education(
    raw: list[dict],
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
) -> list[Education]:
    """Convert the ``education`` array from Claude output into model instances.

    Entries with missing ``school`` are skipped. Year-level dates (YYYY-MM or
    YYYY) are truncated to the year integer; full ISO dates use the year only.
    """
    entries: list[Education] = []
    for item in raw:
        school = (item.get("school") or "").strip()
        if not school:
            logger.warning("Skipping education entry with missing school: %r", item)
            continue

        degree = _truncate(item.get("degree"), 100)
        field = _truncate(item.get("field"), 100)
        gpa_str = _truncate(item.get("gpa"), 10)
        gpa: float | None = None
        if gpa_str:
            try:
                # Accept "3.8" or "3.8/4.0" — take the numerator.
                gpa = float(gpa_str.split("/")[0])
            except ValueError:
                gpa = None

        start_year = _parse_year(item.get("starts_on"), "starts_on")
        end_year = _parse_year(item.get("ends_on"), "ends_on")

        entries.append(Education(
            user_id=user_id,
            profile_id=profile_id,
            school=school[:200],
            degree=degree,
            field=field,
            start_year=start_year,
            end_year=end_year,
            gpa=gpa,
        ))
    return entries


def map_skills(
    raw: list[dict],
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
) -> list[Skill]:
    """Convert the ``skills`` array from Claude output into model instances.

    Skills with a blank ``name`` are skipped. The ``UNIQUE(user_id, lower(name))``
    constraint is enforced by the caller via ``INSERT ... ON CONFLICT DO NOTHING``;
    this mapper does not deduplicate in memory (the DB is authoritative).
    """
    entries: list[Skill] = []
    seen_names: set[str] = set()  # in-batch dedup (case-insensitive)

    for item in raw:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        name_lower = name.lower()
        if name_lower in seen_names:
            continue
        seen_names.add(name_lower)

        raw_category = (item.get("category") or "").strip().lower() or None
        category = raw_category if raw_category in _VALID_SKILL_CATEGORIES else None

        years_raw = item.get("years_experience")
        years_experience: int | None = None
        if years_raw is not None:
            try:
                ye = int(years_raw)
                if 0 <= ye < 70:
                    years_experience = ye
            except (TypeError, ValueError):
                pass

        entries.append(Skill(
            user_id=user_id,
            profile_id=profile_id,
            name=name[:100],
            category=category,
            years_experience=years_experience,
        ))
    return entries


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _parse_date_partial(raw: object, field: str) -> date | None:
    """Parse ``YYYY-MM-DD``, ``YYYY-MM``, or ``YYYY`` into a ``date``.

    Returns ``None`` on failure.
    """
    if not raw:
        return None
    s = str(raw).strip()
    for fmt, default_day, default_month in (
        ("%Y-%m-%d", None, None),
        ("%Y-%m", 1, None),
        ("%Y", 1, 1),
    ):
        try:
            parsed = _strptime(s, fmt, default_day=default_day, default_month=default_month)
            return parsed
        except ValueError:
            continue
    logger.warning("Could not parse %s date %r", field, s)
    return None


def _strptime(s: str, fmt: str, *, default_day: int | None, default_month: int | None) -> date:
    from datetime import datetime as _dt
    d = _dt.strptime(s, fmt)
    return date(
        d.year,
        d.month if default_month is None else (d.month or 1),
        d.day if default_day is None else (d.day or 1),
    )


def _parse_year(raw: object, field: str) -> int | None:
    """Extract the year integer from a date string, or None."""
    if not raw:
        return None
    s = str(raw).strip()
    # Take just the first 4 chars for "YYYY-MM" or "YYYY-MM-DD"
    year_str = s[:4]
    try:
        y = int(year_str)
        if 1950 <= y <= 2100:
            return y
    except ValueError:
        pass
    logger.warning("Could not parse %s year %r", field, s)
    return None


def _truncate(value: object, max_len: int) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s[:max_len] if s else None
