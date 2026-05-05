"""Pydantic schema for the POST /applications/parse-jd response body.

Mirrors the ``JdParseResult`` in ``jd_parsing_service`` but as a proper
Pydantic model for OpenAPI schema generation and response_model validation.
"""
from __future__ import annotations

from pydantic import BaseModel


class JdParseResponse(BaseModel):
    """Structured fields extracted from a job description by Claude.

    All fields are nullable — Claude may not extract every field from every
    JD. The frontend pre-fills form fields where values are non-null and
    lets the user edit before submitting.
    """

    title: str | None = None
    company: str | None = None
    location: str | None = None

    # "remote" | "hybrid" | "onsite" | null — maps to Application.remote_type
    remote_type: str | None = None

    # Normalised numbers (no currency symbols)
    salary_min: float | None = None
    salary_max: float | None = None
    salary_currency: str | None = None

    # "annual" | "monthly" | "hourly" — maps to Application.posted_salary_period
    salary_period: str | None = None

    # "intern" | "entry" | "mid" | "senior" | "staff" | "principal" | "director"
    seniority: str | None = None

    # Structured requirement lists stored in jd_parsed JSONB
    must_have_requirements: list[str] = []
    nice_to_have_requirements: list[str] = []
    responsibilities: list[str] = []

    summary: str | None = None
