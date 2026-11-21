"""Refuse an answer meant for a suggestion the session has moved past."""
from __future__ import annotations

from app.models.resume_refinement.session import ResumeRefinementSession
from app.services.resume_refinement.errors import SuggestionChanged


def ensure_seen_suggestion_is_current(
    session: ResumeRefinementSession,
    *,
    seen_target_index: int | None,
    seen_turn_count: int | None,
) -> None:
    """Raise ``SuggestionChanged`` when the client was showing another suggestion.

    ``target_index`` moves on every advance and every navigation;
    ``turn_count`` moves on every advance, regeneration and fresh
    proposal. Together they pin the suggestion on screen. A value the
    client didn't send (an older build) isn't checked.
    """
    if seen_target_index is not None and seen_target_index != session.target_index:
        raise SuggestionChanged()
    if seen_turn_count is not None and seen_turn_count != session.turn_count:
        raise SuggestionChanged()
