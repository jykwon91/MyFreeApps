"""Cross-user isolation: user B cannot read or act on user A's rows.

Each test seeds a row owned by user A, then drives the real HTTP route as
user B and asserts a 404 (the same answer as a missing id, so existence
does not leak) and that A's row is untouched. A positive control (the owner
gets 200) in each group proves the 404 is the tenant filter and not a
broken route or fixture.

Covers resume-refinement sessions, resume-upload downloads, job analyses
and company research.
"""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company
from app.models.company.company_research import CompanyResearch
from app.models.job_analysis.job_analysis import JobAnalysis
from app.models.jobs.resume_upload_job import ResumeUploadJob
from app.models.profile.profile import Profile
from app.models.resume_refinement.session import ResumeRefinementSession

_REFINEMENT = "/resume-refinement/sessions"
_DRAFT = "# Jane Doe\n\n- Built the thing"


async def _seed_session(db: AsyncSession, user: dict) -> ResumeRefinementSession:
    session = ResumeRefinementSession(
        user_id=uuid.UUID(user["id"]), current_draft=_DRAFT,
    )
    db.add(session)
    await db.commit()
    return session


async def _seed_upload_job(db: AsyncSession, user: dict) -> ResumeUploadJob:
    profile = Profile(user_id=uuid.UUID(user["id"]))
    db.add(profile)
    await db.flush()
    job = ResumeUploadJob(
        user_id=uuid.UUID(user["id"]),
        profile_id=profile.id,
        file_path=f"resumes/{uuid.uuid4()}/resume.pdf",
        status="complete",
    )
    db.add(job)
    await db.commit()
    return job


async def _seed_analysis(db: AsyncSession, user: dict) -> JobAnalysis:
    analysis = JobAnalysis(
        user_id=uuid.UUID(user["id"]),
        jd_text="Senior engineer role",
        fingerprint="a" * 64,
        extracted={},
        verdict="strong_fit",
        verdict_summary="a private verdict",
    )
    db.add(analysis)
    await db.commit()
    return analysis


async def _seed_company_with_research(
    db: AsyncSession, user: dict,
) -> tuple[Company, CompanyResearch]:
    company = Company(
        user_id=uuid.UUID(user["id"]), name="Acme Inc", primary_domain="acme.com",
    )
    db.add(company)
    await db.flush()
    research = CompanyResearch(user_id=company.user_id, company_id=company.id)
    db.add(research)
    await db.commit()
    return company, research


# ---------------------------------------------------------------------------
# Resume-refinement sessions
# ---------------------------------------------------------------------------

_SESSION_ROUTES: list[tuple[str, str, dict | None]] = [
    ("GET", "", None),
    ("POST", "/retry-preparation", None),
    ("POST", "/accept", None),
    ("POST", "/accept-flagged", None),
    ("POST", "/custom", {"user_text": "Hijacked bullet"}),
    ("POST", "/alternative", {}),
    ("POST", "/skip", None),
    ("POST", "/navigate", {"direction": "next"}),
    ("POST", "/target-from-line", {"current_text": "Built the thing", "section": "Experience"}),
    ("POST", "/complete", None),
    ("GET", "/export?format=docx", None),
    ("GET", "/export?format=pdf", None),
]


@pytest.mark.asyncio
async def test_owner_can_read_own_refinement_session(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user_a = await user_factory()
    session = await _seed_session(db, user_a)
    async with await as_user(user_a) as authed_a:
        resp = await authed_a.get(f"{_REFINEMENT}/{session.id}")
    assert resp.status_code == 200
    assert resp.json()["current_draft"] == _DRAFT


@pytest.mark.asyncio
@pytest.mark.parametrize(("method", "suffix", "body"), _SESSION_ROUTES)
async def test_user_b_gets_404_on_user_a_refinement_session(
    db: AsyncSession, user_factory, as_user,
    method: str, suffix: str, body: dict | None,
) -> None:
    user_a = await user_factory()
    user_b = await user_factory()
    session = await _seed_session(db, user_a)

    async with await as_user(user_b) as authed_b:
        resp = await authed_b.request(
            method, f"{_REFINEMENT}/{session.id}{suffix}", json=body,
        )

    assert resp.status_code == 404, f"{method} {suffix or '/'} leaked: {resp.text}"
    await db.refresh(session)
    assert session.current_draft == _DRAFT
    assert session.status == "active"
    assert session.completed_at is None


@pytest.mark.asyncio
async def test_user_b_cannot_start_session_from_user_a_resume(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user_a = await user_factory()
    user_b = await user_factory()
    job = await _seed_upload_job(db, user_a)

    async with await as_user(user_b) as authed_b:
        resp = await authed_b.post(
            _REFINEMENT, json={"source_resume_job_id": str(job.id)},
        )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Resume-upload download
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_b_cannot_download_user_a_resume(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user_a = await user_factory()
    user_b = await user_factory()
    job = await _seed_upload_job(db, user_a)
    storage = MagicMock()
    storage.generate_presigned_url.return_value = "https://files.example/signed"

    with patch("app.services.jobs.resume_upload_service.get_storage", return_value=storage):
        async with await as_user(user_a) as authed_a:
            owner_resp = await authed_a.get(f"/resume-upload-jobs/{job.id}/download")
        owner_signed = storage.generate_presigned_url.call_count
        async with await as_user(user_b) as authed_b:
            other_resp = await authed_b.get(f"/resume-upload-jobs/{job.id}/download")
            other_status = await authed_b.get(f"/resume-upload-jobs/{job.id}")

    assert owner_resp.status_code == 200
    assert owner_resp.json() == {"url": "https://files.example/signed"}
    assert other_resp.status_code == 404
    assert other_status.status_code == 404
    # B's request must not have reached object storage at all.
    assert storage.generate_presigned_url.call_count == owner_signed


# ---------------------------------------------------------------------------
# Job analyses
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_b_cannot_read_or_apply_user_a_analysis(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user_a = await user_factory()
    user_b = await user_factory()
    analysis = await _seed_analysis(db, user_a)

    async with await as_user(user_a) as authed_a:
        owner_resp = await authed_a.get(f"/jobs/analyze/{analysis.id}")
    async with await as_user(user_b) as authed_b:
        read_resp = await authed_b.get(f"/jobs/analyze/{analysis.id}")
        apply_resp = await authed_b.post(f"/jobs/analyze/{analysis.id}/apply")
        apps_resp = await authed_b.get("/applications")

    assert owner_resp.status_code == 200
    assert "a private verdict" in owner_resp.text
    assert read_resp.status_code == 404
    assert "a private verdict" not in read_resp.text
    assert apply_resp.status_code == 404
    assert apps_resp.json()["items"] == []
    await db.refresh(analysis)
    assert analysis.applied_application_id is None


# ---------------------------------------------------------------------------
# Company research
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_b_cannot_read_or_run_user_a_company_research(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user_a = await user_factory()
    user_b = await user_factory()
    company, _research = await _seed_company_with_research(db, user_a)

    async with await as_user(user_a) as authed_a:
        owner_resp = await authed_a.get(f"/companies/{company.id}/research")
    # Patch the outbound search so a leak would show as a call, not a network hit.
    with patch(
        "app.services.company.company_research_service.search_company",
    ) as search:
        async with await as_user(user_b) as authed_b:
            read_resp = await authed_b.get(f"/companies/{company.id}/research")
            run_resp = await authed_b.post(f"/companies/{company.id}/research")
            company_resp = await authed_b.get(f"/companies/{company.id}")

    assert owner_resp.status_code == 200
    assert read_resp.status_code == 404
    assert run_resp.status_code == 404
    assert company_resp.status_code == 404
    search.assert_not_called()
