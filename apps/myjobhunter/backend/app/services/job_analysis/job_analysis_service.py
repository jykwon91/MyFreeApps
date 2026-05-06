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
"""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from typing import Any

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.job_analysis.job_analysis import JobAnalysis
from app.models.profile.profile import Profile
from app.repositories.application import application_event_repository, application_repository
from app.repositories.company import company_repository
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

logger = logging.getLogger(__name__)


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

_VALID_REMOTE_TYPE: frozenset[str] = frozenset(("remote", "hybrid", "onsite"))

# Salary period values from the prompt are mapped to the application
# model's check-constraint values (annual / monthly / hourly).
_SALARY_PERIOD_MAP: dict[str, str] = {
    "year": "annual",
    "month": "monthly",
    "hour": "hourly",
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
    schema enforces this; this layer re-checks defensively).

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

    # ---- Step 1: resolve the JD source ----
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
        # Compose a single text body from the extracted fields. The
        # analysis prompt only needs the JD content; everything else is
        # auxiliary metadata we'll merge into the response's
        # ``extracted`` field after Claude runs.
        resolved_jd_text = _join_extracted_text(extracted)
    else:
        assert jd_text is not None
        source_url = None
        resolved_jd_text = jd_text.strip()

    if not resolved_jd_text:
        raise JobAnalysisError(
            "Resolved JD text is empty — refusing to call Claude on no content",
        )

    # ---- Step 2: load the operator's profile snapshot ----
    snapshot = await _load_profile_snapshot(db, user_id)

    # ---- Step 3: call Claude ----
    user_content = _build_user_content(snapshot=snapshot, jd_text=resolved_jd_text)
    try:
        meta = await claude_service.call_claude_with_meta(
            system_prompt=JOB_ANALYSIS_PROMPT,
            user_content=user_content,
            # extraction_logs check constraint doesn't yet include
            # "job_analysis"; "other" is the legal bucket today.
            context_type="other",
            user_id=user_id,
            context_id=None,
        )
    except (anthropic.APIError, ValueError) as exc:
        logger.warning("Claude job-analysis call failed: %s", exc)
        raise JobAnalysisError(f"AI analysis failed: {exc}") from exc

    parsed = meta["parsed"]

    # ---- Step 4: validate the envelope ----
    validated = _validate_response(parsed)

    # ---- Step 5: persist + commit ----
    fingerprint = _compute_fingerprint(source_url=source_url, jd_text=resolved_jd_text)

    analysis = JobAnalysis(
        user_id=user_id,
        source_url=source_url,
        jd_text=resolved_jd_text,
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
    await db.commit()
    return analysis


async def get_analysis(
    db: AsyncSession,
    user_id: uuid.UUID,
    analysis_id: uuid.UUID,
) -> JobAnalysis | None:
    """Return a non-deleted analysis scoped to ``user_id`` or ``None``."""
    return await job_analysis_repository.get_by_id(db, analysis_id, user_id)


async def apply_to_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    analysis_id: uuid.UUID,
) -> Application | None:
    """Create an Application from a stored analysis.

    Looks up or creates the Company by name (using the same
    ``primary_domain``-or-``name`` heuristic the AddApplicationDialog
    uses), creates the Application with the extracted role title +
    salary + location + remote_type fields, logs an initial
    ``applied`` event, sets ``analysis.applied_application_id``, and
    commits.

    Returns ``None`` if the analysis doesn't exist or belongs to
    another user. Returns the created Application otherwise.

    Idempotency: if ``analysis.applied_application_id`` is already set,
    returns the existing application without creating a duplicate.
    """
    analysis = await job_analysis_repository.get_by_id(db, analysis_id, user_id)
    if analysis is None:
        return None

    if analysis.applied_application_id is not None:
        existing = await application_repository.get_by_id(
            db, analysis.applied_application_id, user_id,
        )
        if existing is not None:
            return existing
        # The previous link points at a deleted/missing app — fall
        # through and create a fresh one.

    extracted = analysis.extracted or {}
    company_name = (extracted.get("company") or "Unknown company").strip() or "Unknown company"
    role_title = (extracted.get("title") or "Untitled role").strip() or "Untitled role"

    # Find-or-create the company. Match by case-insensitive name first
    # (cheap, mirrors the dialog's behavior), fall back to creating a
    # fresh row.
    company = await _find_or_create_company(
        db, user_id=user_id, name=company_name,
    )

    application = Application(
        user_id=user_id,
        company_id=company.id,
        role_title=role_title[:200],
        url=analysis.source_url,
        jd_text=analysis.jd_text,
        location=(extracted.get("location") or None),
        remote_type=_safe_remote_type(extracted.get("remote_type")),
        posted_salary_min=_safe_float(extracted.get("posted_salary_min")),
        posted_salary_max=_safe_float(extracted.get("posted_salary_max")),
        posted_salary_currency=(
            (extracted.get("posted_salary_currency") or "USD")[:3].upper()
        ),
        posted_salary_period=_map_salary_period(extracted.get("posted_salary_period")),
        notes=(analysis.verdict_summary or None),
    )
    application = await application_repository.create(db, application)

    # Mirror application_service.create_application's auto-event so
    # latest_status is never None after this path.
    initial_event = ApplicationEvent(
        user_id=user_id,
        application_id=application.id,
        event_type="applied",
        # No applied_at on JobAnalysis — use the analysis creation time.
        occurred_at=analysis.created_at,
        source="system",
    )
    await application_event_repository.create(db, initial_event)

    await job_analysis_repository.update(
        db, analysis, {"applied_application_id": application.id},
    )

    await db.commit()
    return application


async def soft_delete_analysis(
    db: AsyncSession,
    user_id: uuid.UUID,
    analysis_id: uuid.UUID,
) -> bool:
    """Set ``deleted_at`` on the analysis. Idempotent — second DELETE
    on an already-deleted row also returns True."""
    from datetime import datetime, timezone

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


async def _find_or_create_company(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    name: str,
) -> Any:
    """Find a company by case-insensitive name, or create one."""
    from app.models.company.company import Company

    matches = await company_repository.list_by_user(
        db, user_id, name_search=name,
    )
    needle = name.strip().lower()
    for c in matches:
        if c.name.strip().lower() == needle:
            return c
    fresh = Company(user_id=user_id, name=name[:200])
    return await company_repository.create(db, fresh)


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


def _str_or_none(value: object) -> str | None:
    if not value or not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped if stripped else None


def _safe_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if result < 0:
        return None
    return result


def _safe_remote_type(value: object) -> str:
    cleaned = _str_or_none(value)
    if cleaned in _VALID_REMOTE_TYPE:
        return cleaned  # type: ignore[return-value]
    return "unknown"


def _map_salary_period(value: object) -> str | None:
    cleaned = _str_or_none(value)
    if cleaned is None:
        return None
    return _SALARY_PERIOD_MAP.get(cleaned)
