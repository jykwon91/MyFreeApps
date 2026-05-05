"""Critique service — runs the initial pass that produces improvement_targets.

Called once per session at start. Walks the entire resume markdown and
asks Claude for a prioritized list of bullet/section targets to
rewrite. Output is persisted on the session row; the rewrite loop then
walks the targets one at a time.
"""
from __future__ import annotations

import logging
import uuid

from app.services.extraction.claude_service import call_claude_with_meta
from app.services.extraction.prompts.resume_critique_prompt import (
    RESUME_CRITIQUE_PROMPT,
)
from app.services.resume_refinement.errors import CritiqueRetryExceeded

logger = logging.getLogger(__name__)


async def run_critique(
    *,
    resume_markdown: str,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> dict:
    """Run the critique pass and return ``targets`` plus token meta.

    Args:
        resume_markdown: The current resume draft.
        user_id: Scopes the extraction_log row.
        session_id: Used as the ``context_id`` for the extraction_log.

    Returns:
        ``{"targets": [...], "input_tokens": int, "output_tokens": int,
        "cost_usd": Decimal}``

    Raises:
        CritiqueRetryExceeded: when Claude returns no targets after the
            single attempt. Caller should surface a user-actionable error.
    """
    result = await call_claude_with_meta(
        system_prompt=RESUME_CRITIQUE_PROMPT,
        user_content=f"Resume markdown:\n\n{resume_markdown}",
        context_type="resume_critique",
        user_id=user_id,
        context_id=session_id,
    )

    parsed = result["parsed"]
    raw_targets = parsed.get("targets") or []

    cleaned = [_normalize_target(t) for t in raw_targets if isinstance(t, dict)]
    cleaned = [t for t in cleaned if t is not None]

    if not cleaned:
        logger.warning(
            "Critique pass returned no usable targets for session %s", session_id,
        )
        raise CritiqueRetryExceeded(
            "Claude returned no improvement targets. The resume may already be polished."
        )

    return {
        "targets": cleaned,
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
        "cost_usd": result["cost_usd"],
    }


def _normalize_target(raw: dict) -> dict | None:
    """Validate / clean one target dict. Returns None on missing required fields."""
    section = (raw.get("section") or "").strip()
    current_text = (raw.get("current_text") or "").strip()
    if not section or not current_text:
        return None

    improvement_type = (raw.get("improvement_type") or "other").strip()
    if improvement_type not in {
        "add_metric",
        "add_outcome",
        "tighten_phrasing",
        "remove_jargon",
        "stronger_verb",
        "add_scope",
        "fix_grammar",
        "other",
    }:
        improvement_type = "other"

    severity = (raw.get("severity") or "medium").strip()
    if severity not in {"critical", "high", "medium", "low"}:
        severity = "medium"

    notes = raw.get("notes")
    if notes is not None:
        notes = str(notes).strip() or None

    return {
        "section": section,
        "current_text": current_text,
        "improvement_type": improvement_type,
        "severity": severity,
        "notes": notes,
    }
