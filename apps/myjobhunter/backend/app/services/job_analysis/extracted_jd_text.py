"""The JD text body the analysis prompt reads, composed from a URL extraction.

Split out of ``job_analysis_service`` (no-growth split).
"""
from __future__ import annotations

import re

from app.services.extraction.jd_url_extractor import ExtractedJD


def join_extracted_text(extracted: ExtractedJD) -> str:
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
