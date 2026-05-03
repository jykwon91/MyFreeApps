"""Unit tests for the attachment-kind heuristic in import_signed_lease.

The heuristic is a pure function — test it directly.
"""
from __future__ import annotations

import pytest

from app.services.leases.signed_lease_service import _infer_attachment_kind


class TestInferAttachmentKind:
    def test_first_file_is_always_signed_lease(self) -> None:
        assert _infer_attachment_kind("lease.pdf", 0) == "signed_lease"
        assert _infer_attachment_kind("move-in inspection.pdf", 0) == "signed_lease"
        assert _infer_attachment_kind("random.docx", 0) == "signed_lease"

    def test_second_file_default_is_signed_addendum(self) -> None:
        assert _infer_attachment_kind("addendum.pdf", 1) == "signed_addendum"
        assert _infer_attachment_kind("exhibit-a.pdf", 2) == "signed_addendum"

    def test_move_in_inspection_heuristic(self) -> None:
        assert _infer_attachment_kind("move-in inspection.pdf", 1) == "move_in_inspection"
        assert _infer_attachment_kind("Move In Inspection.pdf", 1) == "move_in_inspection"
        assert _infer_attachment_kind("move_in_checklist.pdf", 1) == "move_in_inspection"

    def test_move_out_inspection_heuristic(self) -> None:
        assert _infer_attachment_kind("move-out inspection.pdf", 1) == "move_out_inspection"
        assert _infer_attachment_kind("Move Out Inspection.pdf", 1) == "move_out_inspection"
        assert _infer_attachment_kind("MOVE_OUT_FORM.pdf", 1) == "move_out_inspection"

    def test_ambiguous_name_falls_back_to_addendum(self) -> None:
        # "move" without "in" or "out" → signed_addendum
        assert _infer_attachment_kind("moveouta.pdf", 1) == "move_out_inspection"
        assert _infer_attachment_kind("document.pdf", 1) == "signed_addendum"
