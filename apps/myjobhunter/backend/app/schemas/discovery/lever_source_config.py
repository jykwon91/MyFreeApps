"""Typed config schema for Lever saved searches.

Lever publishes a free, no-auth public job-board feed at:
``GET https://api.lever.co/v0/postings/{company_slug}?mode=json``

The only required piece of operator configuration is ``company_slug`` — the
slug that appears in the Lever URL: ``jobs.lever.co/<company_slug>``.

Validation design
=================

- ``company_slug`` is validated against a regex that mirrors the slug shape
  Lever accepts.  This also provides SSRF protection — same rationale as
  GreenhouseSourceConfig.  No user-supplied string should reach a URL
  template without shape validation.

- ``model_config = ConfigDict(extra="forbid")`` rejects typos at the API
  boundary.

- ``parse_or_default`` raises on invalid config (same reasoning as
  GreenhouseSourceConfig — there is no meaningful default slug to fall
  back to).
"""
from __future__ import annotations

import logging
import re

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

logger = logging.getLogger(__name__)

# Lever company slugs are lowercase alphanumeric + hyphens.  Lever's own
# URL convention uses lowercase only, but we normalize to lowercase in the
# validator to be forgiving of case typos.  The regex enforces the post-
# normalization shape.
_COMPANY_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


class LeverSourceConfig(BaseModel):
    """Strict-typed config for a Lever public job-board saved search.

    The operator supplies the company_slug from the Lever URL:
    ``jobs.lever.co/<company_slug>``.  That is the only config
    needed — no API key, no authentication.
    """

    company_slug: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description=(
            "The company slug from the Lever URL: "
            "jobs.lever.co/<company_slug>"
        ),
    )

    model_config = ConfigDict(extra="forbid")

    @field_validator("company_slug")
    @classmethod
    def validate_company_slug_shape(cls, v: str) -> str:
        """Normalize to lowercase and reject non-slug shapes.

        This is the primary SSRF guard — company_slug is interpolated
        directly into the fetch URL.  Lowercase normalization lets operators
        paste slugs without worrying about case.
        """
        normalized = v.lower()
        if not _COMPANY_SLUG_RE.match(normalized):
            raise ValueError(
                "company_slug must be a lowercase alphanumeric slug "
                "(letters, digits, hyphens; 1-64 chars; "
                "must start with a letter or digit). "
                f"Got: {v!r}",
            )
        return normalized

    @classmethod
    def parse_or_default(cls, raw: dict | None) -> "LeverSourceConfig":
        """Validate raw config from a stored saved-search row.

        Used at fetch time.  Raises on invalid config because there is no
        meaningful default slug to fall back to (unlike JSearch which can
        run a parameterless search).
        """
        if raw is None or not raw:
            raise ValueError(
                "Lever source config is missing — company_slug is required",
            )
        try:
            return cls.model_validate(raw)
        except ValidationError as exc:
            logger.warning(
                "Lever source config validation failed: %s",
                exc,
            )
            raise ValueError(
                f"Lever source config invalid: {exc}",
            ) from exc
