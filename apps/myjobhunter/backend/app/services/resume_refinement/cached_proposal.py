"""Validity check for a cached/prefetched proposal before it is served.

``proposal_cache`` is keyed by target index and filled at session start
(against the ORIGINAL draft and a ``prior_context`` holding only the
critique rationale) and after every generation. Each entry records what
it was generated against (see ``session_proposal_cache_repo``); it may be
served — on advance, navigate or a jump to a target — only while the
session still matches that.
"""
from __future__ import annotations

from typing import Any


def is_cached_proposal_usable(
    entry: dict[str, Any] | None,
    *,
    target: dict[str, Any],
    current_draft: str,
    context_marker: int,
    confirmed_facts_count: int,
) -> bool:
    """Return True when ``entry`` can be served for ``target`` without calling Claude.

    ``context_marker`` is the newest turn index currently feeding
    ``prior_context`` (``session_helpers._prior_context_marker``). An
    entry is NOT usable when:

    - it does not exist;
    - its section differs from the target's (the index now points at a
      different target than the one the entry was generated for);
    - the target text, or the entry's recorded ``target_text``, is empty
      or missing, or the two differ — there is nothing to verify the
      rewrite against;
    - the target text now appears in the draft a different number of
      times than at generation time — an accept/custom edit removed,
      duplicated or overlapped it, so applying the rewrite would miss
      the text (and ``_apply_rewrite`` would append a duplicate bullet);
    - its ``context_marker`` differs from the current one — the user
      added a custom rewrite, an alternative hint or a clarify question
      after it was generated, and the Claude path would now see that
      context. Plain accept/skip turns never move the marker, so the
      common advance still hits the cache;
    - it is guard-flagged and the user has confirmed facts since — the
      flag may no longer apply.
    """
    if not entry:
        return False
    if entry.get("section") != target.get("section"):
        return False
    target_text = target.get("current_text")
    if not target_text or entry.get("target_text") != target_text:
        return False
    if current_draft.count(target_text) != entry.get("draft_occurrences"):
        return False
    if entry.get("context_marker") != context_marker:
        return False
    if entry.get("guard_flagged"):
        return entry.get("confirmed_facts_count") == confirmed_facts_count
    return True
