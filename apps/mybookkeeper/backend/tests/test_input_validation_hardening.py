"""Schema-level input validation tests — audit 2026-05-02.

MBK scope:
1. BlackoutUpdateRequest — host_notes max_length cap + extra="forbid" (Cat 2 + Cat 3).
2. ScreeningUploadRequest — extra="forbid" (Cat 3).

These are pure unit tests against Pydantic schema construction — no DB or
HTTP calls needed.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.listings.blackout_update_request import BlackoutUpdateRequest
from app.schemas.applicants.screening_upload_request import ScreeningUploadRequest


# ===========================================================================
# BlackoutUpdateRequest — host_notes length cap + extra="forbid"
# ===========================================================================


class TestBlackoutUpdateRequestLengthCap:
    """host_notes is capped at 10 000 characters."""

    def test_accepts_notes_at_limit(self) -> None:
        req = BlackoutUpdateRequest(host_notes="x" * 10000)
        assert req.host_notes is not None

    def test_rejects_notes_over_limit(self) -> None:
        with pytest.raises(ValidationError):
            BlackoutUpdateRequest(host_notes="x" * 10001)

    def test_accepts_none_notes(self) -> None:
        req = BlackoutUpdateRequest(host_notes=None)
        assert req.host_notes is None

    def test_accepts_empty_string(self) -> None:
        req = BlackoutUpdateRequest(host_notes="")
        assert req.host_notes == ""

    def test_accepts_normal_notes(self) -> None:
        req = BlackoutUpdateRequest(host_notes="Closed for maintenance")
        assert req.host_notes == "Closed for maintenance"


class TestBlackoutUpdateRequestExtraForbid:
    """BlackoutUpdateRequest rejects extra fields (mass-assignment guard)."""

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            BlackoutUpdateRequest(host_notes="Valid notes", injected_field="bad")

    def test_rejects_user_id_injection(self) -> None:
        with pytest.raises(ValidationError):
            BlackoutUpdateRequest(host_notes="Valid notes", user_id="some-id")


# ===========================================================================
# ScreeningUploadRequest — extra="forbid"
# ===========================================================================


class TestScreeningUploadRequestExtraForbid:
    """ScreeningUploadRequest rejects extra fields (mass-assignment guard)."""

    def test_accepts_valid_pass_status(self) -> None:
        req = ScreeningUploadRequest(status="pass")
        assert req.status == "pass"

    def test_accepts_valid_fail_status_with_snippet(self) -> None:
        req = ScreeningUploadRequest(
            status="fail",
            adverse_action_snippet="Credit score below threshold",
        )
        assert req.adverse_action_snippet == "Credit score below threshold"

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            ScreeningUploadRequest(status="pass", injected_field="bad")

    def test_rejects_unknown_status_field(self) -> None:
        """Regression: extra=forbid must not swallow the status validator."""
        with pytest.raises(ValidationError):
            ScreeningUploadRequest(status="pass", extra_key="sneaky")

    def test_happy_path_no_extra_is_clean(self) -> None:
        req = ScreeningUploadRequest(status="inconclusive")
        assert req.adverse_action_snippet is None
