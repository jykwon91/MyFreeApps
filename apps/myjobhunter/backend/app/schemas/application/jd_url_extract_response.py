"""Pydantic schema for POST /applications/extract-from-url response body.

Mirrors the ``ExtractedJD`` dataclass returned by the
``jd_url_extractor`` service. Every field is nullable except
``source_url`` — the source URL is always echoed back so the client can
display "fetched from <url>" when pre-filling the Add Application form.

``description_html`` and ``requirements_text`` are deliberately
typed as plain strings (not Pydantic ``Html`` / ``Text`` distinct types)
because the frontend renders them inside a sanitized text area and a
Markdown renderer respectively — the type-system distinction would not
buy us anything beyond an extra coercion.

The frontend converts the response into the existing
``JdParseResponse``-shaped form pre-fill values via ``setValue`` calls
in ``AddApplicationDialog`` — so this schema does NOT include the
salary / remote-type / seniority fields the Claude JD-text parser
emits. Those continue to be populated by ``POST /applications/parse-jd``
when the operator chooses the "Paste the description text" path or
the URL path runs through the HTML-text Claude fallback.
"""
from __future__ import annotations

from pydantic import BaseModel


class JdUrlExtractResponse(BaseModel):
    """Structured fields extracted from a job-posting URL.

    All fields are nullable so the schema can represent a JD that
    came back partial (e.g. a schema.org payload with only ``title``
    and ``description``). The frontend pre-fills any non-null value
    and leaves the rest blank for the operator to type in.
    """

    title: str | None = None
    company: str | None = None
    # Canonical company website (``hiringOrganization.sameAs`` in
    # schema.org JobPosting). Populated only on the schema.org fast
    # path; Claude HTML-text fallback leaves it None. Lets the
    # frontend's auto-create populate ``primary_domain`` so the
    # company has a usable identity beyond just the name.
    company_website: str | None = None
    # Company logo URL (``hiringOrganization.logo`` — may be a plain
    # URL string OR an ImageObject with ``url``). Same fast-path-only
    # caveat as ``company_website``.
    company_logo_url: str | None = None
    location: str | None = None

    # Long-form HTML (preserved when the source publishes it as HTML —
    # JobPosting.description is commonly an HTML string per schema.org).
    description_html: str | None = None

    # Plain-text or Markdown bullet list of requirements when the source
    # surfaces them separately. May be ``None`` even on success — many
    # postings bundle requirements into the description body.
    requirements_text: str | None = None

    # 1–3 sentence plain-English summary. Only populated when Claude is
    # invoked on the HTML-text fallback path; the schema.org fast path
    # leaves this null because the JobPosting payload does not carry
    # a summary field.
    summary: str | None = None

    # Source URL is echoed back verbatim so the UI can show
    # "Fetched from <url>" alongside the pre-fill banner.
    source_url: str
