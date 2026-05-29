"""Regression tests for the profile snapshot the job-analysis prompt sends.

These guard the "Daniel Leba" trust bug (TECH_DEBT — "Fit-scoring rejected a
candidate for a role they have already held"): a directly-relevant role that
sits *below* the recency cutoff was hard-truncated (``rows[:8]``) out of the
snapshot, so the fit scorer never saw it and scored blind.

Two layers:

* **Pure-function tests** exercise the selection policy with in-memory rows and
  no DB session — they run in milliseconds and never touch Postgres (so they
  are immune to the Windows asyncpg test-runner hang).
* **DB-integration test** persists real rows and runs the full
  ``load_profile_snapshot`` query path; CI (Linux) is the authoritative gate
  for it.

All assertions are on the assembled snapshot — no Claude call — so they pin the
prompt-assembly contract regardless of how the model later scores it.
"""
from __future__ import annotations

import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile.profile import Profile
from app.models.profile.work_history import WorkHistory
from app.services.job_analysis.profile_snapshot import (
    _FULL_DETAIL_WORK_HISTORY,
    _MAX_SKILLS,
    _MAX_WORK_HISTORY,
    load_profile_snapshot,
    select_skills,
    select_work_history,
)


def _work_row(title: str, start: date, *, bullets: list[str] | None = None):
    """A duck-typed stand-in for a WorkHistory ORM row."""
    return SimpleNamespace(
        company_name=f"{title} Co",
        title=title,
        start_date=start,
        end_date=None,
        bullets=bullets if bullets is not None else ["did a thing"],
    )


def _skill_row(name: str, years: int | None):
    return SimpleNamespace(name=name, years_experience=years, category=None)


# ===========================================================================
# Pure-function policy tests — no DB, run in milliseconds
# ===========================================================================


class TestSelectWorkHistory:
    def test_relevant_role_beyond_full_detail_window_is_still_present(self) -> None:
        """The core Daniel Leba regression.

        Rows arrive newest-first (the repository orders ``start_date desc``).
        A directly-relevant role that is OLDER than the full-detail window
        must still reach the snapshot — the old ``rows[:8]`` truncation
        dropped it entirely.
        """
        relevant_title = "Air Traffic Controller"
        # Newest-first: N recent fillers, then the relevant (oldest) role last.
        rows = [
            _work_row(f"Generic Role {i}", date(2024 - i, 1, 1))
            for i in range(_FULL_DETAIL_WORK_HISTORY + 4)
        ]
        rows.append(_work_row(relevant_title, date(1999, 1, 1)))

        out = select_work_history(rows)
        titles = [w["title"] for w in out]

        assert relevant_title in titles, (
            "A relevant role older than the recency cutoff was dropped from "
            f"the snapshot (Daniel Leba bug). Got: {titles}"
        )
        # It must live in the COMPACT tail — i.e. the old recency-only
        # `[:_FULL_DETAIL_WORK_HISTORY]` slice would NOT have contained it.
        # This is what makes the test a real regression guard.
        assert titles.index(relevant_title) >= _FULL_DETAIL_WORK_HISTORY

    def test_recent_roles_keep_bullets_older_roles_are_compacted(self) -> None:
        rows = [
            _work_row(f"Role {i}", date(2024 - i, 1, 1), bullets=["b1", "b2"])
            for i in range(_FULL_DETAIL_WORK_HISTORY + 3)
        ]
        out = select_work_history(rows)

        # The most-recent full-detail window carries bullets...
        assert "bullets" in out[0]
        assert out[0]["bullets"] == ["b1", "b2"]
        # ...older roles are present but compacted (no bullets) to bound size.
        compacted = out[_FULL_DETAIL_WORK_HISTORY]
        assert "bullets" not in compacted
        assert compacted["title"] and compacted["company_name"]

    def test_short_history_sends_every_role_untouched(self) -> None:
        rows = [_work_row(f"Role {i}", date(2024 - i, 1, 1)) for i in range(5)]
        out = select_work_history(rows)
        assert [w["title"] for w in out] == [f"Role {i}" for i in range(5)]
        assert all("bullets" in w for w in out)  # all within full-detail window

    def test_pathological_history_is_capped(self) -> None:
        rows = [
            _work_row(f"Role {i}", date(2024, 1, 1))
            for i in range(_MAX_WORK_HISTORY + 10)
        ]
        out = select_work_history(rows)
        assert len(out) == _MAX_WORK_HISTORY


class TestSelectSkills:
    def test_high_experience_skill_survives_cap_despite_late_alphabetical(self) -> None:
        """A high-experience skill that sorts late alphabetically must not be
        dropped by the cap — the old `name.asc()` + `[:40]` would lose it."""
        relevant = "zzz_kubernetes"  # sorts last alphabetically
        skills = [_skill_row(f"skill_{i:03d}", 0) for i in range(_MAX_SKILLS + 5)]
        skills.append(_skill_row(relevant, 12))

        names = [s["name"] for s in select_skills(skills)]
        assert relevant in names
        # Most-experienced sorts to the front.
        assert names[0] == relevant

    def test_under_cap_sends_every_skill(self) -> None:
        skills = [_skill_row(f"skill_{i}", i) for i in range(10)]
        names = {s["name"] for s in select_skills(skills)}
        assert names == {f"skill_{i}" for i in range(10)}

    def test_none_experience_sorts_last_not_crashes(self) -> None:
        skills = [_skill_row("with_years", 5), _skill_row("no_years", None)]
        names = [s["name"] for s in select_skills(skills)]
        assert names == ["with_years", "no_years"]


# ===========================================================================
# DB-integration test — full query path (CI/Linux authoritative)
# ===========================================================================


@pytest.mark.asyncio
async def test_load_profile_snapshot_includes_relevant_old_role(
    db: AsyncSession, user_factory,
) -> None:
    """End-to-end: persisted rows -> repository ordering -> snapshot.

    The relevant role is the OLDEST (sorts last under ``start_date desc``);
    it must still appear in the loaded snapshot.
    """
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    profile = Profile(user_id=user_id, summary="Test engineer")
    db.add(profile)
    await db.flush()

    relevant_title = "Air Traffic Controller"
    for i in range(_FULL_DETAIL_WORK_HISTORY + 4):
        db.add(
            WorkHistory(
                user_id=user_id,
                profile_id=profile.id,
                company_name=f"Filler Corp {i}",
                title=f"Generic Role {i}",
                start_date=date(2012 + i, 1, 1),  # newer as i grows
            )
        )
    db.add(
        WorkHistory(
            user_id=user_id,
            profile_id=profile.id,
            company_name="Relevant Airfield",
            title=relevant_title,
            start_date=date(2005, 1, 1),  # oldest -> sorts last -> used to drop
        )
    )
    await db.flush()

    snapshot = await load_profile_snapshot(db, user_id)
    titles = [w["title"] for w in snapshot["work_history"]]
    assert relevant_title in titles, (
        f"Relevant old role dropped from snapshot. Got: {titles}"
    )
