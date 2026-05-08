"""Typed config schema for JSearch saved searches.

Replaces the loose ``dict[str, Any]`` shape that ``DiscoverySource.config``
previously accepted. Per the audit's "DiscoverySource.config is unvalidated"
finding (High severity, 2026-05-07): typos like ``min_salary_us`` instead
of ``min_salary_usd`` were silently no-oping. Unknown chip keys for
``excluded_industry_chips`` were silently dropped. The operator had no
signal their saved search was misconfigured.

Design notes
============

- The DB column ``discovery_sources.config`` stays ``JSONB`` — no
  migration. We validate via ``JSearchSourceConfig.model_validate(...)``
  at the API boundary (in ``DiscoverySourceCreate``) so a typo gets a
  422 with a clear field name AND at fetch time so old rows persisted
  before this validation existed get caught at the boundary they're
  consumed.

- ``model_config = ConfigDict(extra="forbid")`` means typos blow up
  immediately. This is the fix for "min_salary_us silently does
  nothing" — pydantic raises a validation error.

- ``Literal[...]`` enums for ``date_posted`` / ``employment_type`` /
  ``experience`` / ``country`` mean a typo on those values also
  rejects at validation time.

- The ``parse_or_default`` classmethod is for the fetch-time path,
  where we'd rather log a warning + ship empty config than crash
  the whole worker on a bad legacy row. Operators get the warning;
  the loop continues.

- Keys mirror the frontend literally — no rename layer. Easier to
  trace from form input to DB row.
"""
from __future__ import annotations

import logging
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

logger = logging.getLogger(__name__)


# Tuples used both as Literal arguments and at call sites for
# enumeration (e.g. populating dropdowns in tests).

DatePosted = Literal["all", "today", "3days", "week", "month"]
Country = Literal["us", "ca", "uk", "au"]
EmploymentType = Literal["", "FULLTIME", "PARTTIME", "CONTRACTOR", "INTERN"]
Experience = Literal[
    "",
    "no_experience",
    "under_3_years_experience",
    "more_than_3_years_experience",
    "no_degree",
]
IndustryChipKey = Literal[
    "government_defense",
    "staffing_recruiting",
    "consulting_big4",
    "crypto_web3",
    "adtech_gambling",
]


class JSearchSourceConfig(BaseModel):
    """Strict-typed config for a JSearch saved search.

    Operator-supplied fields, validated at the API boundary. The
    ``page`` / ``num_pages`` knobs the worker uses internally are
    NOT exposed here — those are server-controlled.
    """

    # Either ``roles`` (new structured shape) OR legacy ``query``
    # (Boolean string) — backwards compat for sources created before
    # the structured-input redesign in PR #412. New saved searches
    # always use ``roles``.
    roles: list[str] = Field(default_factory=list)
    query: str | None = Field(default=None)

    skills: list[str] = Field(default_factory=list)
    location: str | None = Field(default=None)
    country: Country = "us"
    date_posted: DatePosted = "all"
    remote_jobs_only: bool = False
    employment_type: EmploymentType = ""
    experience: Experience = ""
    min_salary_usd: int | None = Field(default=None, ge=0)

    excluded_industry_chips: list[IndustryChipKey] = Field(default_factory=list)
    excluded_keywords: list[str] = Field(default_factory=list)

    # ``extra='forbid'`` is the load-bearing piece — typos like
    # ``min_salary_us`` were the bug we're fixing.
    model_config = ConfigDict(extra="forbid")

    @classmethod
    def parse_or_default(cls, raw: dict | None) -> "JSearchSourceConfig":
        """Validate raw config from a stored saved-search row.

        Used at fetch time, where we have a row that was persisted
        before this validation existed (or was written by a malformed
        request that bypassed validation somehow). On validation
        failure we log + return a default config rather than crashing
        the whole fetch loop — the operator's saved search will still
        run with default JSearch params.

        Use ``cls.model_validate(raw)`` directly when you want
        validation errors to propagate (the API boundary).
        """
        if raw is None:
            return cls()
        try:
            return cls.model_validate(raw)
        except ValidationError as exc:
            logger.warning(
                "JSearch source config validation failed (using defaults): %s",
                exc,
            )
            return cls()
