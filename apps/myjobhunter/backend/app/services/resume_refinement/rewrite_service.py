"""Rewrite service — fires once per target during the iteration loop.

Given (a) the full resume markdown for context, (b) one target from
the critique pass, and (c) optional user hint, asks Claude for ONE
rewrite or ONE clarifying question. The hallucination guard then
verifies that any proposal stays within the bounds of the source.
"""
from __future__ import annotations

import json
import logging
import uuid

from app.services.extraction.claude_service import call_claude_with_meta
from app.services.extraction.prompts.resume_rewrite_prompt import (
    RESUME_REWRITE_PROMPT,
)
from app.services.resume_refinement.hallucination_guard import check_proposal

logger = logging.getLogger(__name__)


async def run_rewrite(
    *,
    resume_markdown: str,
    target: dict,
    hint: str | None,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> dict:
    """Run one rewrite pass.

    Args:
        resume_markdown: The current resume draft (full context).
        target: One element from ``improvement_targets``.
        hint: Optional user nudge for the regeneration ("more concise",
            "emphasize technical leadership"). None for the first proposal.
        user_id: Scopes the extraction_log row.
        session_id: Used as ``context_id``.

    Returns:
        Dict with shape:
        - ``kind``: 'proposal' or 'clarify'
        - ``rewritten_text``: str | None  (when kind=proposal)
        - ``rationale``: str | None       (when kind=proposal)
        - ``question``: str | None        (when kind=clarify)
        - ``hallucination_flagged``: list[str]  (empty when guard passed)
        - ``input_tokens``: int
        - ``output_tokens``: int
        - ``cost_usd``: Decimal

        When the hallucination guard fails, ``kind`` is downgraded to
        ``'clarify'`` and ``question`` describes what fact the user
        should provide. The original proposal is returned in
        ``rewritten_text`` for traceability but should NOT be applied
        to the draft.
    """
    user_content = _build_user_content(resume_markdown, target, hint)

    result = await call_claude_with_meta(
        system_prompt=RESUME_REWRITE_PROMPT,
        user_content=user_content,
        context_type="resume_rewrite",
        user_id=user_id,
        context_id=session_id,
    )

    parsed = result["parsed"]
    kind = (parsed.get("kind") or "").strip()

    response: dict = {
        "kind": "clarify",
        "rewritten_text": None,
        "rationale": None,
        "question": None,
        "hallucination_flagged": [],
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
        "cost_usd": result["cost_usd"],
    }

    if kind == "proposal":
        rewritten = (parsed.get("rewritten_text") or "").strip()
        rationale = (parsed.get("rationale") or "").strip() or None

        flagged = check_proposal(proposed=rewritten, source=resume_markdown)
        if flagged:
            logger.warning(
                "Hallucination guard flagged proposal for session %s: %s",
                session_id,
                flagged[:5],
            )
            response.update(
                kind="clarify",
                rewritten_text=rewritten,
                rationale=rationale,
                question=_clarify_for_hallucination(flagged),
                hallucination_flagged=flagged,
            )
            return response

        response.update(
            kind="proposal",
            rewritten_text=rewritten,
            rationale=rationale,
        )
        return response

    if kind == "clarify":
        response["question"] = (parsed.get("question") or "").strip() or (
            "Could you give me more detail about this section so I can rewrite it accurately?"
        )
        return response

    # Unknown kind — treat as clarification request to keep the loop safe.
    logger.warning(
        "Rewrite returned unknown kind=%r for session %s; treating as clarify.",
        kind,
        session_id,
    )
    response["question"] = (
        "I'm not sure how to rephrase this without more detail. "
        "Could you tell me more about what you want to emphasize?"
    )
    return response


def _build_user_content(
    resume_markdown: str,
    target: dict,
    hint: str | None,
) -> str:
    target_blob = json.dumps(
        {
            "section": target.get("section"),
            "current_text": target.get("current_text"),
            "improvement_type": target.get("improvement_type"),
            "severity": target.get("severity"),
            "notes": target.get("notes"),
        },
        indent=2,
    )

    parts = [
        "Resume markdown (full context):",
        "",
        resume_markdown,
        "",
        "----",
        "",
        "Target to rewrite:",
        "",
        target_blob,
    ]
    if hint:
        parts.extend(["", "----", "", f"User hint for the regeneration: {hint}"])
    return "\n".join(parts)


def _clarify_for_hallucination(missing: list[str]) -> str:
    """Build a user-facing clarification question from the flagged facts."""
    preview = ", ".join(missing[:3])
    return (
        "I almost added some details that aren't in your resume "
        f"({preview}). Could you confirm those, or tell me what's accurate "
        "so I can rewrite this without inventing facts?"
    )
