"""Profile-snapshot construction for the job-analysis prompt.

Extracted from :mod:`job_analysis_service` (which sits above the 500-LOC
no-growth line) so the "what does the fit scorer see about the candidate"
policy lives in one place and can be unit-tested without a database. The
service re-exports the public names for backward compatibility.

Snapshot policy
===============

* **Work history** — the repository returns roles newest-first. The most
  recent ``_FULL_DETAIL_WORK_HISTORY`` roles are sent with their bullets;
  every *older* role is still sent in **compact** form (title / company /
  dates, no bullets), up to ``_MAX_WORK_HISTORY`` total. This is the fix for
  the "Daniel Leba" trust bug: a directly-relevant older role used to be
  hard-truncated out of the prompt entirely (``rows[:8]``), so the scorer
  never saw it and rejected a candidate for a role they had already held.
  Compacting rather than dropping keeps the prompt bounded while guaranteeing
  no role is invisible.
* **Skills** — re-ranked most-experienced-first before the cap, so that for
  skill-heavy profiles a truncation drops the least-informative entries
  rather than whatever sorts late alphabetically. The repository's default
  alphabetical ordering (relied on by the profile UI) is left untouched.
* **Education** — the most-recent ``_MAX_EDUCATION`` entries.

The selection helpers (:func:`select_work_history`, :func:`select_skills`)
are pure functions of an already-ordered list, so they exercise the policy
in milliseconds with in-memory rows and no DB session.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile.profile import Profile
from app.repositories.profile import (
    education_repository,
    profile_repository,
    skill_repository,
    work_history_repository,
)

# The most-recent N roles carry full bullets. Older roles are still sent,
# but compacted to title/company/dates so the prompt stays bounded without
# dropping a role the scorer may need to see.
_FULL_DETAIL_WORK_HISTORY = 8
# Absolute safety cap on roles sent (compact beyond the full-detail window).
# Well above a realistic career; bounds pathological inputs only.
_MAX_WORK_HISTORY = 40
_MAX_EDUCATION = 5
# Skills are tiny in the prompt; a generous cap means truncation almost never
# bites, and when it does the experience-ranking below keeps the best ones.
_MAX_SKILLS = 60
# Cap bullets per role to keep the prompt size predictable.
_MAX_BULLETS_PER_ROLE = 8


async def load_profile_snapshot(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Load + bound the operator's profile snapshot for the prompt."""
    profile = await profile_repository.get_by_user_id(db, user_id)
    work_history = await work_history_repository.list_by_user(db, user_id)
    education = await education_repository.list_by_user(db, user_id)
    skills = await skill_repository.list_by_user(db, user_id)

    return {
        "profile": _profile_to_dict(profile),
        "work_history": select_work_history(work_history),
        "education": [_edu_to_dict(e) for e in education[:_MAX_EDUCATION]],
        "skills": select_skills(skills),
    }


def select_work_history(work_history: list[Any]) -> list[dict]:
    """Choose the work-history entries to send, newest-first.

    The most-recent ``_FULL_DETAIL_WORK_HISTORY`` roles keep their bullets;
    older roles (up to ``_MAX_WORK_HISTORY`` total) are sent compacted so a
    directly-relevant older role is never dropped from the prompt. Pure
    function of an already-ordered list — unit-tested without a DB.
    """
    selected = work_history[:_MAX_WORK_HISTORY]
    return [
        _work_to_dict(entry, compact=index >= _FULL_DETAIL_WORK_HISTORY)
        for index, entry in enumerate(selected)
    ]


def select_skills(skills: list[Any]) -> list[dict]:
    """Choose the skills to send, most-experienced first.

    Re-ranking before the cap means that when an operator has more than
    ``_MAX_SKILLS`` skills, the ones dropped are the least-experienced rather
    than whatever sorts late alphabetically. For profiles under the cap the
    set sent is identical to before — only ordering at the boundary changes —
    so this is a near-zero-risk safety improvement. The repository's default
    alphabetical ordering (used by the profile UI) is deliberately untouched.
    """
    ranked = sorted(
        skills,
        key=lambda s: (-(s.years_experience or 0), (s.name or "").lower()),
    )
    return [_skill_to_dict(s) for s in ranked[:_MAX_SKILLS]]


def _profile_to_dict(profile: Profile | None) -> dict:
    if profile is None:
        # Empty snapshot — the analysis still runs, but every dimension
        # that depends on profile facts will land on "unclear" or
        # "no_target". The operator sees a "complete your profile" CTA.
        return {
            "summary": None,
            "seniority": None,
            "work_auth_status": "unknown",
            "desired_salary_min": None,
            "desired_salary_max": None,
            "salary_currency": "USD",
            "locations": [],
            "remote_preference": "any",
        }
    return {
        "summary": profile.summary,
        "seniority": profile.seniority,
        "work_auth_status": profile.work_auth_status,
        "desired_salary_min": (
            float(profile.desired_salary_min)
            if profile.desired_salary_min is not None
            else None
        ),
        "desired_salary_max": (
            float(profile.desired_salary_max)
            if profile.desired_salary_max is not None
            else None
        ),
        "salary_currency": profile.salary_currency,
        "locations": list(profile.locations or []),
        "remote_preference": profile.remote_preference,
    }


def _work_to_dict(w: Any, *, compact: bool = False) -> dict:
    """Serialize a work-history row for the snapshot.

    ``compact`` omits the bullets (kept for the most-recent roles only) so
    older roles still register as experience without inflating the prompt.
    """
    entry = {
        "company_name": w.company_name,
        "title": w.title,
        "start_date": w.start_date.isoformat() if w.start_date else None,
        "end_date": w.end_date.isoformat() if w.end_date else None,
    }
    if not compact:
        entry["bullets"] = list(w.bullets or [])[:_MAX_BULLETS_PER_ROLE]
    return entry


def _edu_to_dict(e: Any) -> dict:
    return {
        "school": e.school,
        "degree": getattr(e, "degree", None),
        "field": getattr(e, "field", None),
        "end_year": getattr(e, "end_year", None),
    }


def _skill_to_dict(s: Any) -> dict:
    return {
        "name": s.name,
        "years_experience": s.years_experience,
        "category": s.category,
    }


def build_user_content(*, snapshot: dict, jd_text: str) -> str:
    """Compose the user-message body for the analysis prompt.

    The format is "Profile:\n<json>\n\nJob description:\n<text>" so the
    model has a clean break between the two inputs and can parse the
    profile reliably without being confused by JSON-looking content
    inside the JD.
    """
    profile_json = json.dumps(snapshot, ensure_ascii=False, indent=2)
    return (
        "# Candidate profile (JSON)\n\n"
        f"{profile_json}\n\n"
        "# Job description (plain text)\n\n"
        f"{jd_text}"
    )
