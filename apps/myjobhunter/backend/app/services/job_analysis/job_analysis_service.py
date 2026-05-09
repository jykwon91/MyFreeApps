"""Job-analysis service — orchestrates the Analyze-a-job pipeline.

Pipeline (one Claude call, two DB reads, one DB write):

1. Resolve the JD source: if the request has only ``url``, fetch +
   extract via the existing :func:`jd_url_extractor.extract_from_url`.
   If it has ``jd_text``, use that verbatim.
2. Load the operator's profile snapshot — Profile, Skill rows, top
   N WorkHistory rows, and Education rows. The snapshot is bounded
   in size so the prompt stays under Claude's input window even for
   operators with 20+ skills and 10+ jobs of history.
3. Build the analysis prompt user-content (a JSON-shaped envelope of
   profile + jd_text) and call ``claude_service.call_claude_with_meta``
   so the per-call token / cost meta lands on the JobAnalysis row.
4. Validate the Claude response: every dimension status must be in
   the dimension's enum, the verdict must be one of the four legal
   values, the dimensions array must contain the five expected keys.
5. Persist the JobAnalysis row, commit, return.

Tenant isolation
================
``user_id`` is required on every public function. The repo also
filters by ``user_id`` (defense in depth). The Profile + Skill +
WorkHistory + Education loads all scope by ``user_id`` too.

Cost accounting
================
``call_claude_with_meta`` returns ``input_tokens`` / ``output_tokens``
/ ``cost_usd``. We persist them on the JobAnalysis row so the operator
sees per-analysis cost in the UI, matching the resume-refinement
session pattern.

Module layout
=============
This module owns: ``analyze``, ``score``, ``get_analysis``,
``soft_delete_analysis``, and all response-validation / prompt-building
helpers.

Promote logic (creating an Application from a JobAnalysis) lives in the
sibling :mod:`job_analysis_promote_service`. ``apply_to_application`` is
re-exported here for backward compatibility so existing callers
(``app.api.job_analysis``, tests) need no import changes.
"""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.job_analysis.job_analysis import JobAnalysis
from app.models.profile.profile import Profile
from app.repositories.job_analysis import job_analysis_repository
from app.repositories.profile import (
    education_repository,
    profile_repository,
    skill_repository,
    work_history_repository,
)
from app.services.extraction import claude_service
from app.services.extraction.jd_url_extractor import (
    JDFetchAuthRequiredError,
    JDFetchError,
    JDFetchTimeoutError,
    extract_from_url,
)
from app.services.extraction.prompts.job_analysis_prompt import JOB_ANALYSIS_PROMPT
from app.services.job_analysis._job_analysis_utils import (
    _SALARY_PERIOD_MAP,
    _VALID_REMOTE_TYPE,
    _map_salary_period,
    _safe_float,
    _safe_remote_type,
    _str_or_none,
)

logger = logging.getLogger(__name__)

# Re-export so callers that import ``apply_to_application`` from this
# module keep working without change (the implementation moved to the
# sibling promote module). The promote module does NOT import from this
# module (it uses _job_analysis_utils directly), so there is no circular
# import.
from app.services.job_analysis.job_analysis_promote_service import (  # noqa: E402
    apply_to_application,
)

__all__ = [
    # Core analyze / score surface
    "analyze",
    "score",
    "get_analysis",
    "soft_delete_analysis",
    # Re-exported from promote module for backward compat
    "apply_to_application",
    # Public error types
    "JobAnalysisError",
    "JobAnalysisFetchAuthRequiredError",
    "JobAnalysisFetchTimeoutError",
    "JobAnalysisInvalidUrlError",
]


# ---------------------------------------------------------------------------
# Public errors — route handler maps each to a specific HTTP status.
# ---------------------------------------------------------------------------


class JobAnalysisError(RuntimeError):
    """Generic analysis failure — HTTP 502."""


class JobAnalysisFetchAuthRequiredError(JobAnalysisError):
    """Source URL was auth-walled or returned an empty body — HTTP 422."""


class JobAnalysisFetchTimeoutError(JobAnalysisError):
    """Source URL fetch timed out — HTTP 504."""


class JobAnalysisInvalidUrlError(JobAnalysisError):
    """Source URL was malformed — HTTP 400."""


# ---------------------------------------------------------------------------
# Validation tables — must match the prompt's enum guidance.
# ---------------------------------------------------------------------------


_VERDICTS: frozenset[str] = frozenset(
    ("strong_fit", "worth_considering", "stretch", "mismatch"),
)

_DIMENSION_KEYS: tuple[str, ...] = (
    "skill_match",
    "seniority",
    "salary",
    "location_remote",
    "work_auth",
)

_DIMENSION_STATUS: dict[str, frozenset[str]] = {
    "skill_match": frozenset(("strong", "partial", "gap", "unclear")),
    "seniority": frozenset(("aligned", "below", "above", "unclear")),
    "salary": frozenset(
        ("above_target", "in_range", "below_target", "not_disclosed", "no_target"),
    ),
    "location_remote": frozenset(
        ("compatible", "stretch", "incompatible", "unclear"),
    ),
    "work_auth": frozenset(("compatible", "blocker", "unclear")),
}

# Bound the profile snapshot we send to Claude. Operators with very long
# work histories don't pay for an unbounded prompt — the most-recent
# entries carry the most signal.
_MAX_WORK_HISTORY = 8
_MAX_EDUCATION = 5
_MAX_SKILLS = 40

# Cap red/green flag list lengths server-side too — defensive against
# prompt-injection that inflates the array beyond what the UI handles.
_MAX_FLAGS = 5

# Cap rationale length per dimension. The model is asked for 1-2
# sentences; cap at 600 chars to keep payload size predictable.
_MAX_RATIONALE_CHARS = 600


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------


async def analyze(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    url: str | None,
    jd_text: str | None,
) -> JobAnalysis:
    """Run a fit-analysis for ``user_id`` on the given JD.

    Exactly one of ``url`` / ``jd_text`` must be non-empty (the request
    schema enforces this; this layer re-checks defensively). When ``url``
    is given, this function fetches it via ``jd_url_extractor.extract_from_url``
    and composes a JD text body from the structured extraction.

    For callers that already have JD text in hand (the discovery worker,
    the chrome extension), prefer :func:`score` directly — it skips URL
    resolution and accepts pre-extracted fields as a hint.

    Returns the persisted :class:`JobAnalysis` row.

    Raises:
        JobAnalysisInvalidUrlError: URL malformed.
        JobAnalysisFetchAuthRequiredError: URL auth-walled or empty body.
        JobAnalysisFetchTimeoutError: URL fetch timed out.
        JobAnalysisError: Claude failed, returned malformed JSON, or
            returned an envelope that didn't pass validation.
    """
    has_url = bool(url and url.strip())
    has_text = bool(jd_text and jd_text.strip())
    if has_url == has_text:
        raise JobAnalysisError(
            "analyze() requires exactly one of url / jd_text",
        )

    source_url: str | None
    resolved_jd_text: str
    if has_url:
        assert url is not None
        source_url = url.strip()
        try:
            extracted = await extract_from_url(source_url, user_id=user_id)
        except JDFetchAuthRequiredError as exc:
            raise JobAnalysisFetchAuthRequiredError(str(exc)) from exc
        except JDFetchTimeoutError as exc:
            raise JobAnalysisFetchTimeoutError(str(exc)) from exc
        except JDFetchError as exc:
            raise JobAnalysisError(str(exc)) from exc
        except ValueError as exc:
            raise JobAnalysisInvalidUrlError(str(exc)) from exc
        resolved_jd_text = _join_extracted_text(extracted)
    else:
        assert jd_text is not None
        source_url = None
        resolved_jd_text = jd_text.strip()

    return await score(
        db,
        user_id,
        jd_text=resolved_jd_text,
        source_url=source_url,
    )


async def score(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    jd_text: str,
    source_url: str | None = None,
    extracted_hint: dict | None = None,
    discovered_job_id: uuid.UUID | None = None,
    discovered_job: DiscoveredJob | None = None,
) -> JobAnalysis:
    """Score pre-resolved JD text against ``user_id``'s profile.

    Pure JD-text-in, JobAnalysis-out: no URL fetching, no extra IO. Both
    :func:`analyze` (paste-URL flow) and the discovery score worker call
    this function so the scoring rubric, validation, and persistence
    shape stay consistent across surfaces.

    Args:
        jd_text: The full JD text body. Must be non-empty after stripping.
        source_url: Optional canonical URL the JD came from. Used for the
            fingerprint and persisted on the JobAnalysis row.
        extracted_hint: Optional pre-extracted fields the caller already
            knows (title, company, location, salary, etc.) — Claude's
            ``extracted`` block is merged with this hint, hint values
            overriding for the fields it provides. The discovery worker
            uses this so we don't pay Claude to re-extract structural
            fields the source API already returned.
        discovered_job_id: Optional FK back to the discovered_jobs row
            this scoring run was triggered for. Stored as ``context_id``
            on the extraction_log entry so per-feature cost rollups can
            join.
        discovered_job: Optional ORM row for the same discovered_jobs
            posting. When provided, ``score``, ``score_reason``, and
            ``scored_at`` are written to the row within the same
            ``db.commit()`` that persists the JobAnalysis — collapsing
            what was previously two separate transactions into one so a
            crash between them cannot leave ``discovered_job.score`` NULL
            while the JobAnalysis + cost record already exist.

    Raises:
        JobAnalysisError: Claude failed, returned malformed JSON, or
            returned an envelope that didn't pass validation.
    """
    cleaned_jd = jd_text.strip() if jd_text else ""
    if not cleaned_jd:
        raise JobAnalysisError(
            "score() requires non-empty jd_text",
        )

    snapshot = await _load_profile_snapshot(db, user_id)

    user_content = _build_user_content(snapshot=snapshot, jd_text=cleaned_jd)
    try:
        meta = await claude_service.call_claude_with_meta(
            system_prompt=JOB_ANALYSIS_PROMPT,
            user_content=user_content,
            context_type="job_analysis",
            user_id=user_id,
            context_id=discovered_job_id,
        )
    except (anthropic.APIError, ValueError) as exc:
        logger.warning("Claude job-analysis call failed: %s", exc)
        raise JobAnalysisError(f"AI analysis failed: {exc}") from exc

    validated = _validate_response(meta["parsed"])

    if extracted_hint:
        merged = dict(validated["extracted"])
        for key, value in extracted_hint.items():
            if value is not None:
                merged[key] = value
        validated["extracted"] = merged

    fingerprint = _compute_fingerprint(
        source_url=source_url, jd_text=cleaned_jd,
    )

    analysis = JobAnalysis(
        user_id=user_id,
        source_url=source_url,
        jd_text=cleaned_jd,
        fingerprint=fingerprint,
        extracted=validated["extracted"],
        verdict=validated["verdict"],
        verdict_summary=validated["verdict_summary"],
        dimensions=validated["dimensions"],
        red_flags=validated["red_flags"],
        green_flags=validated["green_flags"],
        total_tokens_in=meta["input_tokens"],
        total_tokens_out=meta["output_tokens"],
        total_cost_usd=meta["cost_usd"],
    )
    analysis = await job_analysis_repository.create(db, analysis)

    # If the caller provided the DiscoveredJob row, mutate it here so the
    # score pointer and the JobAnalysis row land in a single commit. Without
    # this, a crash between the two formerly separate commits left
    # discovered_job.score = NULL while the JobAnalysis + cost record
    # already existed, causing the next refresh to re-pay for scoring.
    if discovered_job is not None:
        discovered_job.score = _verdict_to_score(validated["verdict"])
        discovered_job.score_reason = validated["verdict_summary"]
        discovered_job.scored_at = datetime.now(timezone.utc)
        db.add(discovered_job)

    await db.commit()
    return analysis


async def get_analysis(
    db: AsyncSession,
    user_id: uuid.UUID,
    analysis_id: uuid.UUID,
) -> JobAnalysis | None:
    """Return a non-deleted analysis scoped to ``user_id`` or ``None``."""
    return await job_analysis_repository.get_by_id(db, analysis_id, user_id)


async def soft_delete_analysis(
    db: AsyncSession,
    user_id: uuid.UUID,
    analysis_id: uuid.UUID,
) -> bool:
    """Set ``deleted_at`` on the analysis. Idempotent — second DELETE
    on an already-deleted row also returns True."""
    analysis = await job_analysis_repository.get_by_id(
        db, analysis_id, user_id, include_deleted=True,
    )
    if analysis is None:
        return False
    if analysis.deleted_at is None:
        analysis.deleted_at = datetime.now(timezone.utc)
        await db.flush()
        await db.commit()
    return True


# ---------------------------------------------------------------------------
# Internal helpers — kept module-private so tests can hit them directly.
# ---------------------------------------------------------------------------


def _join_extracted_text(extracted: Any) -> str:
    """Compose a single JD text body from ``ExtractedJD``.

    The analysis prompt only needs the JD CONTENT — title, summary,
    description body, and requirement bullets. Other extracted fields
    (company, location, salary range) are echoed back to the operator
    via the response's ``extracted`` field but are not part of the
    model's analysis input.
    """
    parts: list[str] = []
    if extracted.title:
        parts.append(f"Title: {extracted.title}")
    if extracted.company:
        parts.append(f"Company: {extracted.company}")
    if extracted.location:
        parts.append(f"Location: {extracted.location}")
    if extracted.summary:
        parts.append(f"Summary:\n{extracted.summary}")
    if extracted.description_html:
        parts.append(f"Description:\n{_strip_html(extracted.description_html)}")
    if extracted.requirements_text:
        parts.append(f"Requirements:\n{extracted.requirements_text}")
    return "\n\n".join(parts).strip()


def _strip_html(html: str) -> str:
    """Best-effort HTML → text. Mirrors the AddApplicationDialog's
    ``stripHtml`` so the prompt sees the same text body the form would."""
    import re

    text = re.sub(r"<\s*br\s*/?\s*>", "\n", html, flags=re.I)
    text = re.sub(r"<\s*/?\s*(p|li|div|h[1-6])[^>]*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


async def _load_profile_snapshot(
    db: AsyncSession, user_id: uuid.UUID,
) -> dict:
    """Load + bound the operator's profile snapshot for the prompt."""
    profile = await profile_repository.get_by_user_id(db, user_id)
    work_history = await work_history_repository.list_by_user(db, user_id)
    education = await education_repository.list_by_user(db, user_id)
    skills = await skill_repository.list_by_user(db, user_id)

    return {
        "profile": _profile_to_dict(profile),
        "work_history": [_work_to_dict(w) for w in work_history[:_MAX_WORK_HISTORY]],
        "education": [_edu_to_dict(e) for e in education[:_MAX_EDUCATION]],
        "skills": [_skill_to_dict(s) for s in skills[:_MAX_SKILLS]],
    }


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


def _work_to_dict(w: Any) -> dict:
    return {
        "company_name": w.company_name,
        "title": w.title,
        "start_date": w.start_date.isoformat() if w.start_date else None,
        "end_date": w.end_date.isoformat() if w.end_date else None,
        # Cap bullets per role to keep the prompt size predictable.
        "bullets": list(w.bullets or [])[:8],
    }


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


def _build_user_content(*, snapshot: dict, jd_text: str) -> str:
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


# ---------------------------------------------------------------------------
# Response validation
# ---------------------------------------------------------------------------


def _validate_response(raw: Any) -> dict:
    """Validate Claude's parsed JSON against the analysis envelope.

    Returns a normalized dict ready to construct a :class:`JobAnalysis`
    row. Raises :class:`JobAnalysisError` when the response is missing
    required keys or has malformed types.

    Defensive normalization: out-of-enum status values are coerced to
    "unclear" (or the analogous "fallback" value per dimension) rather
    than rejected outright. Operators get a partial result instead of a
    HTTP 502 when the model deviates slightly from the rubric. The
    ``rationale`` is preserved verbatim so the operator can still see
    the reasoning even when the status is suspect.
    """
    if not isinstance(raw, dict):
        raise JobAnalysisError(
            f"Claude returned a non-dict envelope: {type(raw).__name__}",
        )

    verdict = _str_or_none(raw.get("verdict"))
    if verdict not in _VERDICTS:
        raise JobAnalysisError(
            f"Claude returned an unknown verdict: {verdict!r}",
        )

    verdict_summary = _str_or_none(raw.get("verdict_summary")) or ""
    if not verdict_summary:
        raise JobAnalysisError("Claude returned an empty verdict_summary")

    extracted = _validate_extracted(raw.get("extracted"))
    dimensions = _validate_dimensions(raw.get("dimensions"))

    red_flags = _flag_list(raw.get("red_flags"))
    green_flags = _flag_list(raw.get("green_flags"))

    return {
        "verdict": verdict,
        "verdict_summary": verdict_summary,
        "extracted": extracted,
        "dimensions": dimensions,
        "red_flags": red_flags,
        "green_flags": green_flags,
    }


def _validate_extracted(raw: Any) -> dict:
    """Coerce the extracted block to the JobAnalysisExtracted shape."""
    if not isinstance(raw, dict):
        return {
            "title": None,
            "company": None,
            "location": None,
            "remote_type": None,
            "posted_salary_min": None,
            "posted_salary_max": None,
            "posted_salary_currency": None,
            "posted_salary_period": None,
            "summary": None,
        }
    remote = _str_or_none(raw.get("remote_type"))
    if remote not in _VALID_REMOTE_TYPE:
        remote = None
    period = _str_or_none(raw.get("posted_salary_period"))
    if period not in _SALARY_PERIOD_MAP:
        period = None
    currency = _str_or_none(raw.get("posted_salary_currency"))
    if currency:
        currency = currency[:3].upper()
    return {
        "title": _str_or_none(raw.get("title")),
        "company": _str_or_none(raw.get("company")),
        "location": _str_or_none(raw.get("location")),
        "remote_type": remote,
        "posted_salary_min": _safe_float(raw.get("posted_salary_min")),
        "posted_salary_max": _safe_float(raw.get("posted_salary_max")),
        "posted_salary_currency": currency,
        "posted_salary_period": period,
        "summary": _str_or_none(raw.get("summary")),
    }


def _validate_dimensions(raw: Any) -> list[dict]:
    """Validate the dimensions array against the fixed key order.

    Builds a key→row map from whatever Claude returned, then emits one
    row per expected key in the canonical order. Missing keys produce
    a row with status='unclear' and a generic rationale.
    """
    found: dict[str, dict] = {}
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            key = _str_or_none(item.get("key"))
            if key in _DIMENSION_STATUS:
                status_raw = _str_or_none(item.get("status"))
                rationale = _str_or_none(item.get("rationale")) or ""
                if rationale and len(rationale) > _MAX_RATIONALE_CHARS:
                    rationale = rationale[: _MAX_RATIONALE_CHARS - 1] + "…"
                allowed = _DIMENSION_STATUS[key]
                if status_raw not in allowed:
                    status_raw = _fallback_status_for(key)
                found[key] = {
                    "key": key,
                    "status": status_raw,
                    "rationale": rationale,
                }

    out: list[dict] = []
    for key in _DIMENSION_KEYS:
        row = found.get(key)
        if row is None:
            out.append(
                {
                    "key": key,
                    "status": _fallback_status_for(key),
                    "rationale": (
                        "Insufficient signal in the JD or profile to assess this dimension."
                    ),
                }
            )
        else:
            out.append(row)
    return out


def _fallback_status_for(key: str) -> str:
    """Return the safest 'no signal' status for a given dimension."""
    if key == "salary":
        return "not_disclosed"
    return "unclear"


def _flag_list(raw: Any) -> list[str]:
    """Coerce a value to a bounded list of short strings."""
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        cleaned = item.strip()
        if not cleaned:
            continue
        if len(cleaned) > 200:
            cleaned = cleaned[:199] + "…"
        out.append(cleaned)
        if len(out) >= _MAX_FLAGS:
            break
    return out


# ---------------------------------------------------------------------------
# Tiny utilities
# ---------------------------------------------------------------------------


def _compute_fingerprint(*, source_url: str | None, jd_text: str) -> str:
    """SHA-256 hex fingerprint for v2 idempotency.

    URL takes precedence — the same URL re-analyzed should produce the
    same fingerprint regardless of fetch-time HTML changes. JD text
    falls back to the trimmed first 256 chars.
    """
    material = (source_url or "").strip().lower()
    if not material:
        material = jd_text[:256].strip()
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _verdict_to_score(verdict: str) -> int:
    """Collapse a job-analysis verdict into a 0–100 integer sort key.

    Used by both the discovery inbox (ordering posted jobs by fit) and
    ``score()`` when writing back to a DiscoveredJob row in the same
    transaction. Keeping the mapping here ensures it stays co-located
    with the verdict enum values it references.
    """
    return {
        "strong_fit": 90,
        "worth_considering": 70,
        "stretch": 40,
        "mismatch": 15,
    }.get(verdict, 50)


# _str_or_none, _safe_float, _safe_remote_type, _map_salary_period
# are imported from _job_analysis_utils at the top of this module.
