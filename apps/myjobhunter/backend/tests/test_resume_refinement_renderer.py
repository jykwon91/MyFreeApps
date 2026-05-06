"""Tests for the _build_renderer_input adapter in session_service.

Covers:
  - Adapter produces the correct dict shape from all four sources
  - Edge case: empty profile (no summary, no history, no education, no skills)
  - Edge case: result_parsed_fields["raw"] is missing — headline falls back to None
  - Edge case: result_parsed_fields["raw"] is invalid JSON — headline falls back to None
  - Integration-ish: full start_session call with mocked DB repos + mocked
    critique/rewrite services — confirms the resulting draft contains work
    history company names and skill names

Pure-function tests use no DB. The start_session integration test mocks
every coroutine that touches the DB or Claude API.
"""
from __future__ import annotations

import json
import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.resume_refinement.session_service import _build_renderer_input
from app.services.resume_refinement.markdown_renderer import render_resume_to_markdown


# ---------------------------------------------------------------------------
# Helpers — build lightweight fakes that match ORM model attribute names
# ---------------------------------------------------------------------------

def _work_history(
    company_name: str = "Acme Corp",
    title: str = "Engineer",
    start_date: date = date(2020, 1, 1),
    end_date: date | None = None,
    bullets: list[str] | None = None,
) -> MagicMock:
    row = MagicMock()
    row.company_name = company_name
    row.title = title
    row.start_date = start_date
    row.end_date = end_date
    row.bullets = bullets or []
    return row


def _education(
    school: str = "State University",
    degree: str | None = "B.S.",
    field: str | None = "Computer Science",
    start_year: int | None = 2014,
    end_year: int | None = 2018,
    gpa: float | None = 3.5,
) -> MagicMock:
    row = MagicMock()
    row.school = school
    row.degree = degree
    row.field = field
    row.start_year = start_year
    row.end_year = end_year
    row.gpa = gpa
    return row


def _skill(name: str = "Python", category: str | None = "language") -> MagicMock:
    row = MagicMock()
    row.name = name
    row.category = category
    return row


def _profile(summary: str | None = "Experienced engineer.") -> MagicMock:
    p = MagicMock()
    p.summary = summary
    return p


# ---------------------------------------------------------------------------
# _build_renderer_input — pure adapter tests (no DB)
# ---------------------------------------------------------------------------


def test_adapter_produces_correct_shape_all_sources_populated():
    profile = _profile("Experienced engineer.")
    wh = _work_history(
        company_name="Acme Corp",
        title="Staff Engineer",
        start_date=date(2020, 3, 1),
        end_date=None,
        bullets=["Led platform migration", "Reduced latency by 40%"],
    )
    edu = _education(
        school="MIT",
        degree="M.S.",
        field="CS",
        start_year=2016,
        end_year=2018,
        gpa=3.9,
    )
    sk = _skill("Python", "language")
    raw_parsed = {"raw": json.dumps({"headline": "Staff Engineer at Acme"})}

    result = _build_renderer_input(
        profile=profile,
        work_history_rows=[wh],
        education_rows=[edu],
        skill_rows=[sk],
        raw_parsed=raw_parsed,
    )

    assert result["summary"] == "Experienced engineer."
    assert result["headline"] == "Staff Engineer at Acme"

    assert len(result["work_history"]) == 1
    wh_dict = result["work_history"][0]
    assert wh_dict["company"] == "Acme Corp"
    assert wh_dict["title"] == "Staff Engineer"
    assert wh_dict["starts_on"] == "2020-03-01"
    assert wh_dict["ends_on"] is None
    assert wh_dict["is_current"] is True
    assert wh_dict["bullets"] == ["Led platform migration", "Reduced latency by 40%"]

    assert len(result["education"]) == 1
    edu_dict = result["education"][0]
    assert edu_dict["school"] == "MIT"
    assert edu_dict["degree"] == "M.S."
    assert edu_dict["field"] == "CS"
    assert edu_dict["starts_on"] == "2016"
    assert edu_dict["ends_on"] == "2018"
    assert edu_dict["gpa"] == "3.9"

    assert len(result["skills"]) == 1
    assert result["skills"][0] == {"name": "Python", "category": "language"}


def test_adapter_passes_through_renderer_without_crash():
    """The adapter output must be valid input for render_resume_to_markdown."""
    profile = _profile("Good engineer.")
    wh = _work_history(
        company_name="Beta Inc",
        title="SWE",
        start_date=date(2019, 6, 1),
        end_date=date(2022, 12, 31),
        bullets=["Built things"],
    )
    edu = _education()
    sk = _skill("Go", "language")

    result = _build_renderer_input(
        profile=profile,
        work_history_rows=[wh],
        education_rows=[edu],
        skill_rows=[sk],
        raw_parsed=None,
    )
    md = render_resume_to_markdown(result)

    assert "## Summary" in md
    assert "Good engineer." in md
    assert "## Experience" in md
    assert "Beta Inc" in md
    assert "Built things" in md
    assert "## Education" in md
    assert "## Skills" in md
    assert "Go" in md


def test_adapter_empty_profile_does_not_crash():
    """All four sources empty — adapter returns a valid (mostly empty) dict."""
    result = _build_renderer_input(
        profile=None,
        work_history_rows=[],
        education_rows=[],
        skill_rows=[],
        raw_parsed=None,
    )
    assert result["summary"] == ""
    assert result["headline"] is None
    assert result["work_history"] == []
    assert result["education"] == []
    assert result["skills"] == []

    # render_resume_to_markdown must not crash on this input.
    md = render_resume_to_markdown(result)
    # All sections are empty — the renderer should produce empty string.
    assert md == ""


def test_adapter_headline_falls_back_when_raw_is_absent():
    raw_parsed: dict = {}  # no "raw" key at all
    result = _build_renderer_input(
        profile=None,
        work_history_rows=[],
        education_rows=[],
        skill_rows=[],
        raw_parsed=raw_parsed,
    )
    assert result["headline"] is None


def test_adapter_headline_falls_back_when_raw_is_invalid_json():
    raw_parsed = {"raw": "not-valid-json{{{{"}
    result = _build_renderer_input(
        profile=None,
        work_history_rows=[],
        education_rows=[],
        skill_rows=[],
        raw_parsed=raw_parsed,
    )
    assert result["headline"] is None


def test_adapter_headline_falls_back_when_raw_has_no_headline_key():
    raw_parsed = {"raw": json.dumps({"summary": "Something", "work_history": []})}
    result = _build_renderer_input(
        profile=None,
        work_history_rows=[],
        education_rows=[],
        skill_rows=[],
        raw_parsed=raw_parsed,
    )
    assert result["headline"] is None


def test_adapter_education_handles_null_years_and_gpa():
    edu = _education(start_year=None, end_year=None, gpa=None)
    result = _build_renderer_input(
        profile=None,
        work_history_rows=[],
        education_rows=[edu],
        skill_rows=[],
        raw_parsed=None,
    )
    edu_dict = result["education"][0]
    assert edu_dict["starts_on"] == ""
    assert edu_dict["ends_on"] == ""
    assert edu_dict["gpa"] == ""


def test_adapter_skill_with_none_category_falls_back_to_other():
    sk = _skill("Agile", None)
    result = _build_renderer_input(
        profile=None,
        work_history_rows=[],
        education_rows=[],
        skill_rows=[sk],
        raw_parsed=None,
    )
    assert result["skills"][0]["category"] == "other"


def test_adapter_work_history_with_end_date_marks_not_current():
    wh = _work_history(start_date=date(2018, 1, 1), end_date=date(2020, 12, 31))
    result = _build_renderer_input(
        profile=None,
        work_history_rows=[wh],
        education_rows=[],
        skill_rows=[],
        raw_parsed=None,
    )
    wh_dict = result["work_history"][0]
    assert wh_dict["ends_on"] == "2020-12-31"
    assert wh_dict["is_current"] is False


# ---------------------------------------------------------------------------
# Integration-ish: start_session with all external calls mocked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_session_draft_contains_company_and_skill_names():
    """start_session must build a draft from the profile repos, not result_parsed_fields.

    Every external call (DB repos + Claude services) is mocked. The assertion
    is that the returned session's initial_draft (passed into session_repo.create)
    contains the company name and skill name we seeded.
    """
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()

    # Fake resume_upload_job (status=complete, result_parsed_fields only has raw key)
    fake_job = MagicMock()
    fake_job.status = "complete"
    fake_job.result_parsed_fields = {"raw": json.dumps({"headline": "Lead Dev"})}

    # Profile with a summary
    fake_profile = MagicMock()
    fake_profile.summary = "Seasoned backend developer."

    # One work history row
    fake_wh = _work_history(
        company_name="GlobalTech",
        title="Senior SWE",
        start_date=date(2021, 4, 1),
        end_date=None,
        bullets=["Shipped the main product", "Mentored junior devs"],
    )

    # One education row
    fake_edu = _education(school="Tech U", degree="B.S.", field="CS", gpa=3.7)

    # Several skill rows
    fake_skills = [
        _skill("Python", "language"),
        _skill("Docker", "tool"),
        _skill("FastAPI", "framework"),
    ]

    # Fake session returned by session_repo.create and subsequent updates
    fake_session = MagicMock()
    fake_session.id = uuid.uuid4()
    fake_session.improvement_targets = [{"section": "summary", "current_text": "x"}]
    fake_session.target_index = 0
    fake_session.pending_proposal = "A new proposal"
    fake_session.pending_rationale = "rationale"
    fake_session.pending_target_section = "summary"
    fake_session.pending_clarifying_question = None
    fake_session.turn_count = 1

    # Capture the initial_draft that session_repo.create receives.
    captured_initial_draft: list[str] = []

    async def fake_session_create(db, *, user_id, source_resume_job_id, initial_draft):
        captured_initial_draft.append(initial_draft)
        return fake_session

    fake_critique = {
        "targets": [{"section": "summary", "current_text": "x", "rationale": "improve"}],
        "input_tokens": 10,
        "output_tokens": 5,
        "cost_usd": 0.001,
    }
    fake_rewrite = {
        "kind": "proposal",
        "rewritten_text": "A new proposal",
        "rationale": "rationale",
        "question": None,
        "input_tokens": 8,
        "output_tokens": 4,
        "cost_usd": 0.001,
    }

    with (
        patch(
            "app.services.resume_refinement.session_service.resume_upload_job_repo.get_by_id_for_user",
            new_callable=AsyncMock,
            return_value=fake_job,
        ),
        patch(
            "app.services.resume_refinement.session_service.profile_repository.get_by_user_id",
            new_callable=AsyncMock,
            return_value=fake_profile,
        ),
        patch(
            "app.services.resume_refinement.session_service.work_history_repository.list_by_user",
            new_callable=AsyncMock,
            return_value=[fake_wh],
        ),
        patch(
            "app.services.resume_refinement.session_service.education_repository.list_by_user",
            new_callable=AsyncMock,
            return_value=[fake_edu],
        ),
        patch(
            "app.services.resume_refinement.session_service.skill_repository.list_by_user",
            new_callable=AsyncMock,
            return_value=fake_skills,
        ),
        patch(
            "app.services.resume_refinement.session_service.session_repo.create",
            new=fake_session_create,
        ),
        patch(
            "app.services.resume_refinement.session_service.critique_service.run_critique",
            new_callable=AsyncMock,
            return_value=fake_critique,
        ),
        patch(
            "app.services.resume_refinement.session_service.session_repo.update_critique",
            new_callable=AsyncMock,
            return_value=fake_session,
        ),
        patch(
            "app.services.resume_refinement.session_service.turn_repo.append",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.resume_refinement.session_service.rewrite_service.run_rewrite",
            new_callable=AsyncMock,
            return_value=fake_rewrite,
        ),
        patch(
            "app.services.resume_refinement.session_service.session_repo.update_pending_proposal",
            new_callable=AsyncMock,
            return_value=fake_session,
        ),
    ):
        from app.services.resume_refinement.session_service import start_session

        db_mock = AsyncMock()
        await start_session(db=db_mock, user_id=user_id, source_resume_job_id=job_id)

    assert len(captured_initial_draft) == 1, "session_repo.create must be called exactly once"
    draft = captured_initial_draft[0]

    # The draft must contain data from the seeded repos, not from result_parsed_fields.
    assert "GlobalTech" in draft, f"Expected 'GlobalTech' in draft; got:\n{draft}"
    assert "Python" in draft, f"Expected 'Python' skill in draft; got:\n{draft}"
    assert "Docker" in draft, f"Expected 'Docker' skill in draft; got:\n{draft}"
    assert "FastAPI" in draft, f"Expected 'FastAPI' skill in draft; got:\n{draft}"
    assert "Seasoned backend developer" in draft, f"Expected summary in draft; got:\n{draft}"
    # Headline was in result_parsed_fields["raw"] so it should appear.
    assert "Lead Dev" in draft, f"Expected headline in draft; got:\n{draft}"
