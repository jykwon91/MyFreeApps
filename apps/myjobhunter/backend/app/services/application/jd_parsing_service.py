"""JD parsing service — orchestrates Claude extraction for job descriptions.

Takes pasted JD text, calls Claude via ``claude_service``, validates and
normalises the response, and returns a ``JdParseResult`` ready for the
route handler to serialize.

The parsed result is intentionally NOT auto-persisted to the Application
row — the frontend calls ``POST /applications/parse-jd`` to get a preview,
then the user edits and submits ``POST /applications`` with the merged
fields. This keeps the two concerns decoupled and avoids a phantom row.

Tenant isolation: ``user_id`` is propagated to ``claude_service`` for the
``extraction_logs`` row; no Application row is touched here.
"""
from __future__ import annotations

import logging
import uuid
from typing import Literal

import anthropic

from app.services.extraction import claude_service
from app.services.extraction.prompts.jd_parsing_prompt import JD_PARSING_PROMPT

logger = logging.getLogger(__name__)

# Seniority values accepted by the frontend / stored in jd_parsed.
_VALID_SENIORITY = frozenset(
    ("intern", "entry", "mid", "senior", "staff", "principal", "director")
)

# Remote type values that map to the Application model's remote_type column.
_VALID_REMOTE_TYPE = frozenset(("remote", "hybrid", "onsite"))

# Salary period values accepted by the Application model's posted_salary_period
# check constraint.  Note: the JD prompt uses "year"/"month"/"hour" while the
# model stores "annual"/"monthly"/"hourly" — we normalise on the way out.
_SALARY_PERIOD_MAP: dict[str, str] = {
    "year": "annual",
    "month": "monthly",
    "hour": "hourly",
}

# Cap list lengths to guard against prompt-injection that inflates the payload.
_MAX_LIST_ITEMS = 20


class JdParseError(RuntimeError):
    """Raised when the Claude call fails or returns unparseable JSON.

    The route handler converts this to HTTP 502 so the client gets a clear
    signal that the upstream AI call failed — not a client-side mistake.
    """


class JdParseResult:
    """Validated + normalised output from a JD parse call."""

    __slots__ = (
        "title",
        "company",
        "location",
        "remote_type",
        "salary_min",
        "salary_max",
        "salary_currency",
        "salary_period",
        "seniority",
        "must_have_requirements",
        "nice_to_have_requirements",
        "responsibilities",
        "summary",
    )

    def __init__(
        self,
        *,
        title: str | None,
        company: str | None,
        location: str | None,
        remote_type: str | None,
        salary_min: float | None,
        salary_max: float | None,
        salary_currency: str | None,
        salary_period: str | None,
        seniority: str | None,
        must_have_requirements: list[str],
        nice_to_have_requirements: list[str],
        responsibilities: list[str],
        summary: str | None,
    ) -> None:
        self.title = title
        self.company = company
        self.location = location
        self.remote_type = remote_type
        self.salary_min = salary_min
        self.salary_max = salary_max
        self.salary_currency = salary_currency
        self.salary_period = salary_period
        self.seniority = seniority
        self.must_have_requirements = must_have_requirements
        self.nice_to_have_requirements = nice_to_have_requirements
        self.responsibilities = responsibilities
        self.summary = summary

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "company": self.company,
            "location": self.location,
            "remote_type": self.remote_type,
            "salary_min": self.salary_min,
            "salary_max": self.salary_max,
            "salary_currency": self.salary_currency,
            "salary_period": self.salary_period,
            "seniority": self.seniority,
            "must_have_requirements": self.must_have_requirements,
            "nice_to_have_requirements": self.nice_to_have_requirements,
            "responsibilities": self.responsibilities,
            "summary": self.summary,
        }


async def parse_jd(
    jd_text: str,
    user_id: uuid.UUID,
    application_id: uuid.UUID | None = None,
) -> JdParseResult:
    """Parse a job description using Claude and return normalised fields.

    Args:
        jd_text: Raw pasted text of the job description.
        user_id: Caller's user ID (for extraction_logs scoping).
        application_id: Optional FK for the extraction_logs context_id — pass
            when an Application row already exists, else leave None.

    Returns:
        A :class:`JdParseResult` with validated, normalised fields.

    Raises:
        JdParseError: when the Claude call fails or returns malformed JSON.
    """
    try:
        raw = await claude_service.call_claude(
            system_prompt=JD_PARSING_PROMPT,
            user_content=jd_text,
            context_type="jd_parse",
            user_id=user_id,
            context_id=application_id,
        )
    except (anthropic.APIError, ValueError) as exc:
        raise JdParseError(f"Claude extraction failed: {exc}") from exc

    return _normalise(raw)


def _normalise(raw: dict) -> JdParseResult:
    """Convert Claude's raw dict into a validated JdParseResult.

    Uses defensively-nullable accessors throughout — Claude may omit fields
    or return unexpected types under schema drift, and we prefer a partial
    result to a crash.
    """
    title = _str_or_none(raw.get("title"))
    company = _str_or_none(raw.get("company"))
    location = _str_or_none(raw.get("location"))

    raw_remote = _str_or_none(raw.get("remote_type"))
    remote_type = raw_remote if raw_remote in _VALID_REMOTE_TYPE else None

    salary_min = _float_or_none(raw.get("salary_min"))
    salary_max = _float_or_none(raw.get("salary_max"))

    raw_currency = _str_or_none(raw.get("salary_currency"))
    # Accept any non-empty string up to 3 chars; the frontend displays it verbatim.
    salary_currency = raw_currency[:3].upper() if raw_currency else None

    raw_period = _str_or_none(raw.get("salary_period"))
    salary_period = _SALARY_PERIOD_MAP.get(raw_period or "", None)

    raw_seniority = _str_or_none(raw.get("seniority"))
    seniority = raw_seniority if raw_seniority in _VALID_SENIORITY else None

    must_have = _str_list(raw.get("must_have_requirements"))
    nice_have = _str_list(raw.get("nice_to_have_requirements"))
    responsibilities = _str_list(raw.get("responsibilities"))

    summary = _str_or_none(raw.get("summary"))

    return JdParseResult(
        title=title,
        company=company,
        location=location,
        remote_type=remote_type,
        salary_min=salary_min,
        salary_max=salary_max,
        salary_currency=salary_currency,
        salary_period=salary_period,
        seniority=seniority,
        must_have_requirements=must_have,
        nice_to_have_requirements=nice_have,
        responsibilities=responsibilities,
        summary=summary,
    )


def _str_or_none(value: object) -> str | None:
    if not value or not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped if stripped else None


def _float_or_none(value: object) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)  # type: ignore[arg-type]
        return result if result >= 0 else None
    except (TypeError, ValueError):
        return None


def _str_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for item in value[:_MAX_LIST_ITEMS]:
        clean = _str_or_none(item)
        if clean:
            items.append(clean)
    return items
