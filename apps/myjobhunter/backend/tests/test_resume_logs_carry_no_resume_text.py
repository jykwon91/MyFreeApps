"""Resume refinement logs and errors carry counts, never the resume's own words.

WARNING lines become Sentry events, and so do the 5xx errors these raise.
"""
import logging
from unittest.mock import patch

import pytest

from app.services.resume_refinement import export_service
from app.services.resume_refinement.session_helpers import _apply_rewrite


def test_rewrite_target_not_found_logs_its_length_only(caplog: pytest.LogCaptureFixture) -> None:
    target = "Led payroll for Jane Doe Holdings"
    with caplog.at_level(logging.WARNING):
        _apply_rewrite("- other bullet", target_current_text=target, new_text="- new")
    assert "Jane Doe" not in caplog.text
    assert f"target_chars={len(target)}" in caplog.text


def test_export_fidelity_failure_names_no_resume_facts(caplog: pytest.LogCaptureFixture) -> None:
    markdown = "## Experience\n\n**Globex Corporation** — 2021 to 2024\n"
    with (
        patch.object(export_service, "_output_to_text", return_value=""),
        caplog.at_level(logging.WARNING),
        pytest.raises(export_service.ExportFidelityError) as exc,
    ):
        export_service._verify_round_trip(markdown=markdown, output_bytes=b"", fmt="pdf")
    assert exc.value.missing_facts
    assert "Globex" not in caplog.text and "Globex" not in str(exc.value)
    assert f"missing {len(exc.value.missing_facts)} " in caplog.text
