"""Tests for the pure-function helpers in session_service.

Full lifecycle integration tests are heavy (DB + Claude mocking + worker
stubs); these focus on the substring-replacement logic that's the hardest
part to get right without real data.
"""
from types import SimpleNamespace

from app.services.resume_refinement.session_service import (
    _apply_rewrite,
    _build_prior_context,
)


def _turn(**fields) -> SimpleNamespace:
    """Build a turn-shaped object with sensible defaults for the test."""
    base = {
        "role": "ai_proposal",
        "target_section": None,
        "rationale": None,
        "clarifying_question": None,
        "user_text": None,
        "proposed_text": None,
    }
    base.update(fields)
    return SimpleNamespace(**base)


def test_apply_rewrite_replaces_first_occurrence_only():
    draft = "- old text\n- old text\n- something else"
    out = _apply_rewrite(
        draft,
        target_current_text="old text",
        new_text="new text",
    )
    # First "- old text" got replaced; the second one is preserved.
    assert out == "- new text\n- old text\n- something else"


def test_apply_rewrite_appends_when_target_not_found():
    draft = "- existing bullet"
    out = _apply_rewrite(
        draft,
        target_current_text="not in draft",
        new_text="appended bullet",
    )
    assert "appended bullet" in out
    assert "existing bullet" in out


def test_apply_rewrite_with_empty_target_appends():
    """An empty target_current_text just appends to the end of the draft."""
    draft = "- existing"
    out = _apply_rewrite(
        draft,
        target_current_text="",
        new_text="new content",
    )
    assert out.endswith("new content")
    assert "existing" in out


def test_apply_rewrite_preserves_surrounding_whitespace():
    draft = "## Section\n\n- bullet to rewrite\n- another bullet"
    out = _apply_rewrite(
        draft,
        target_current_text="bullet to rewrite",
        new_text="rewritten bullet",
    )
    assert out == "## Section\n\n- rewritten bullet\n- another bullet"


def test_build_prior_context_keeps_signal_filters_noise():
    """_build_prior_context distills turns into the lightweight shape the
    rewrite prompt consumes — keeping the entries that carry session-level
    constraints and filtering the ones that are already in current_draft
    (user_accept) or carry no information (user_skip)."""
    turns = [
        _turn(role="ai_critique", rationale="14 bullets need work."),
        _turn(
            role="ai_proposal",
            target_section="Staff Eng @ Acme — bullet 1",
            clarifying_question="What was the throughput?",
        ),
        _turn(
            role="user_request_alternative",
            target_section="Staff Eng @ Acme — bullet 1",
            user_text="Keep the resume to one page.",
        ),
        _turn(
            role="ai_proposal",
            target_section="Staff Eng @ Acme — bullet 1",
            proposed_text="Architected payment processing.",
        ),
        _turn(role="user_accept", target_section="Staff Eng @ Acme — bullet 1"),
        _turn(
            role="user_custom",
            target_section="Senior Eng @ Acme — bullet 2",
            user_text="Owned the migration end-to-end.",
        ),
        _turn(role="user_skip", target_section="Senior Eng @ Acme — bullet 3"),
        _turn(role="session_complete"),
    ]

    out = _build_prior_context(turns)

    kinds = [e["kind"] for e in out]
    assert kinds == [
        "ai_critique",
        "ai_clarification_question",
        "user_hint",
        "user_custom_rewrite",
    ]
    assert all("Architected payment processing" not in e["text"] for e in out)
    assert all(e["kind"] not in ("user_accept", "user_skip", "session_complete") for e in out)


def test_build_prior_context_drops_empty_text():
    """Turns with the right role but no actual text content are skipped —
    no point sending Claude a blank line with a label."""
    turns = [
        _turn(role="ai_critique", rationale=None),
        _turn(role="ai_proposal", clarifying_question=""),
        _turn(role="user_custom", user_text="   "),
    ]
    assert _build_prior_context(turns) == []


def test_build_prior_context_empty_turns_returns_empty_list():
    assert _build_prior_context([]) == []
