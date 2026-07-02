"""Parse-time provenance guard for resume extraction.

The resume-refinement REWRITE path has had a hallucination guard since
it shipped; the PARSE path — which seeds every downstream surface
(profile tables, the /resume draft, exports) — had none. That asymmetry
let a fabricated "40%" metric land in a work-history bullet unnoticed
(operator report, 2026-07-02).

This module checks every extracted work-history bullet and the summary
against the source text with the same ``check_proposal`` primitive the
rewrite guard uses (dates, metrics, proper nouns), and returns
per-bullet verdicts. Nothing is ever dropped or rewritten — a bullet
with one unsourced number usually still carries the user's real
achievement text, so the verdicts are SURFACED (stored on the job row,
shown in the UI) rather than enforced.
"""
from __future__ import annotations

from typing import Any

from app.services.resume_refinement.hallucination_guard import check_proposal


def build_parse_provenance(
    claude_response: dict[str, Any],
    *,
    source_text: str,
) -> dict[str, Any]:
    """Return per-bullet guard verdicts for a parsed resume.

    Args:
        claude_response: The parsed JSON from ``extract_resume``.
        source_text: The text the model actually saw — callers must pass
            the SAME truncation (``claude_service.MAX_TEXT_CHARS``), or a
            bullet sourced from beyond the cutoff would misread as a
            hallucination.

    Returns:
        ``{"checked": True, "flagged": [...]}`` where each entry is
        ``{kind, work_index, company, bullet_index, text,
        unsourced_terms}`` for work bullets, or
        ``{kind: "summary", text, unsourced_terms}`` for the summary.
        An empty ``flagged`` list means every extracted claim was found
        in the source.
    """
    flagged: list[dict[str, Any]] = []

    for work_index, work in enumerate(claude_response.get("work_history") or []):
        for bullet_index, bullet in enumerate(work.get("bullets") or []):
            text = (bullet or "").strip()
            if not text:
                continue
            unsourced = check_proposal(proposed=text, source=source_text)
            if unsourced:
                flagged.append(
                    {
                        "kind": "work_bullet",
                        "work_index": work_index,
                        "company": work.get("company"),
                        "bullet_index": bullet_index,
                        "text": text,
                        "unsourced_terms": unsourced,
                    }
                )

    summary = (claude_response.get("summary") or "").strip()
    if summary:
        unsourced = check_proposal(proposed=summary, source=source_text)
        if unsourced:
            flagged.append(
                {
                    "kind": "summary",
                    "text": summary,
                    "unsourced_terms": unsourced,
                }
            )

    return {"checked": True, "flagged": flagged}
