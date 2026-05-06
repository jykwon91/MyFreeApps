"""Pydantic schema for POST /applications/extract-from-url request body.

The endpoint accepts a single URL pointing at a job posting (career-page
listing, ATS posting, etc.). The service tries the schema.org JobPosting
fast path first, then falls back to a Claude HTML-text extraction. The
parsed result is returned for client-side preview / form pre-fill — no
Application row is created here.

``url`` is validated as ``AnyHttpUrl`` so the caller cannot submit a
``file://``, ``data:``, or otherwise non-HTTP scheme.  Schema-level
URL validation runs BEFORE the route handler, so an invalid URL never
reaches the rate limiter or fetcher.

``extra='forbid'`` defends against forwarding extra fields (cargo-cult
copying of body shape) and matches the rest of the application schemas.
"""
from __future__ import annotations

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, field_serializer


class JdUrlExtractRequest(BaseModel):
    """Body for POST /applications/extract-from-url."""

    url: AnyHttpUrl

    model_config = ConfigDict(extra="forbid")

    @field_serializer("url")
    def _serialize_url(self, value: AnyHttpUrl) -> str:
        """Coerce AnyHttpUrl to plain string when round-tripping the schema."""
        return str(value)
