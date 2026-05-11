"""Typed config schema for Greenhouse saved searches.

Greenhouse publishes a free, no-auth public job-board feed at:
``GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true``

The only required piece of operator configuration is ``board_token`` — the
slug that appears in the board URL: ``boards.greenhouse.io/<board_token>``.

Validation design
=================

- ``board_token`` is validated against a regex that mirrors the slug shape
  Greenhouse accepts. This also provides SSRF protection: we reject any
  value that contains ``../``, ``%``, ``@``, ``/``, or other characters
  that could be used to construct a malicious URL. Per the security agent's
  guidance: no user-supplied string should reach a URL template without
  shape validation.

- ``model_config = ConfigDict(extra="forbid")`` rejects typos at the API
  boundary (the operator gets a 422 with the field name, not a silently
  no-op saved search).

- ``parse_or_default`` mirrors JSearchSourceConfig's pattern: used at
  fetch time where we log + fall back to defaults rather than crashing the
  worker on a malformed legacy row.
"""
from __future__ import annotations

import logging
import re

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

logger = logging.getLogger(__name__)

# Greenhouse board tokens are alphanumeric slugs.  We allow hyphens and
# underscores (Greenhouse generates both) and cap at 64 chars to match
# what Greenhouse actually accepts.  No slashes, dots, percent signs, or
# @ signs allowed — any of those would be an SSRF attempt.
_BOARD_TOKEN_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")


class GreenhouseSourceConfig(BaseModel):
    """Strict-typed config for a Greenhouse public job-board saved search.

    The operator supplies the board_token from the Greenhouse board URL:
    ``boards.greenhouse.io/<board_token>``.  That is the only config
    needed — no API key, no authentication.
    """

    board_token: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description=(
            "The board token from the Greenhouse URL: "
            "boards.greenhouse.io/<board_token>"
        ),
    )

    model_config = ConfigDict(extra="forbid")

    @field_validator("board_token")
    @classmethod
    def validate_board_token_shape(cls, v: str) -> str:
        """Reject tokens that don't match the expected slug shape.

        This is the primary SSRF guard — board_token is interpolated
        directly into the fetch URL, so we must ensure it cannot contain
        path-traversal sequences or URL-special characters.
        """
        if not _BOARD_TOKEN_RE.match(v):
            raise ValueError(
                "board_token must be an alphanumeric slug "
                "(letters, digits, hyphens, underscores; 1-64 chars; "
                "must start with a letter or digit). "
                f"Got: {v!r}",
            )
        return v

    @classmethod
    def parse_or_default(cls, raw: dict | None) -> "GreenhouseSourceConfig":
        """Validate raw config from a stored saved-search row.

        Used at fetch time.  On validation failure we log + raise so the
        fetch loop marks the source as errored with a clear message rather
        than silently no-oping with a bad token.  Unlike JSearch (which
        falls back to empty defaults and runs a zero-result search), a
        Greenhouse source with an invalid board_token cannot run at all —
        there is no meaningful default to fall back to.
        """
        if raw is None or not raw:
            raise ValueError(
                "Greenhouse source config is missing — board_token is required",
            )
        try:
            return cls.model_validate(raw)
        except ValidationError as exc:
            logger.warning(
                "Greenhouse source config validation failed: %s",
                exc,
            )
            raise ValueError(
                f"Greenhouse source config invalid: {exc}",
            ) from exc
