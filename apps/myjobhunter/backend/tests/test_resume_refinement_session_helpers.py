"""Tests for the pure-function helpers in session_service.

Full lifecycle integration tests are heavy (DB + Claude mocking + worker
stubs); these focus on the substring-replacement logic that's the hardest
part to get right without real data.
"""
from app.services.resume_refinement.session_service import _apply_rewrite


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
