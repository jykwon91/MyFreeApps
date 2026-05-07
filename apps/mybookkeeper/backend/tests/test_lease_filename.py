"""Unit tests for ``friendly_download_filename``.

Pure-function tests — covers all four cases from the user spec:
  1. unsigned by both → original filename
  2. signed by tenant only → " - tenant signed" suffix
  3. signed by both → " - fully signed" suffix
  4. non-lease kind → original filename, no suffix

Plus the secondary "landlord-only" branch that the implementation
covers for completeness, plus extension-preservation edge cases.
"""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass

from app.services.leases.lease_filename import friendly_download_filename


@dataclass
class _FakeAttachment:
    filename: str
    kind: str
    signed_by_tenant_at: _dt.datetime | None = None
    signed_by_landlord_at: _dt.datetime | None = None


def _now() -> _dt.datetime:
    return _dt.datetime(2026, 5, 7, 12, 0, 0, tzinfo=_dt.timezone.utc)


# ---------------------------------------------------------------------------
# The four cases the user explicitly enumerated.
# ---------------------------------------------------------------------------


class TestFriendlyDownloadFilenameSpec:
    def test_unsigned_returns_original_docx(self) -> None:
        att = _FakeAttachment(
            filename="Lease Agreement.docx",
            kind="signed_lease",
        )
        assert friendly_download_filename(att) == "Lease Agreement.docx"

    def test_tenant_only_signed_appends_tenant_signed_pdf(self) -> None:
        att = _FakeAttachment(
            filename="Lease Agreement.pdf",
            kind="signed_lease",
            signed_by_tenant_at=_now(),
        )
        assert (
            friendly_download_filename(att)
            == "Lease Agreement - tenant signed.pdf"
        )

    def test_both_signed_appends_fully_signed(self) -> None:
        att = _FakeAttachment(
            filename="Lease Agreement.pdf",
            kind="signed_lease",
            signed_by_tenant_at=_now(),
            signed_by_landlord_at=_now(),
        )
        assert (
            friendly_download_filename(att)
            == "Lease Agreement - fully signed.pdf"
        )

    def test_non_lease_kind_passes_through_unchanged(self) -> None:
        att = _FakeAttachment(
            filename="Move-In Inspection.pdf",
            kind="move_in_inspection",
            # Even when the columns are populated (e.g., a host
            # accidentally set them on a non-lease row), inspections
            # must not get the signing suffix.
            signed_by_tenant_at=_now(),
            signed_by_landlord_at=_now(),
        )
        assert (
            friendly_download_filename(att) == "Move-In Inspection.pdf"
        )


# ---------------------------------------------------------------------------
# Secondary cases — landlord-only, extension preservation, edge guards.
# ---------------------------------------------------------------------------


class TestFriendlyDownloadFilenameEdges:
    def test_landlord_only_signed_uses_landlord_suffix(self) -> None:
        att = _FakeAttachment(
            filename="Lease Agreement.pdf",
            kind="signed_lease",
            signed_by_landlord_at=_now(),
        )
        assert (
            friendly_download_filename(att)
            == "Lease Agreement - landlord signed.pdf"
        )

    def test_rendered_original_kind_also_gets_suffix(self) -> None:
        att = _FakeAttachment(
            filename="Lease Agreement.docx",
            kind="rendered_original",
            signed_by_tenant_at=_now(),
        )
        assert (
            friendly_download_filename(att)
            == "Lease Agreement - tenant signed.docx"
        )

    def test_signed_addendum_kind_passes_through_unchanged(self) -> None:
        att = _FakeAttachment(
            filename="Pet Addendum.pdf",
            kind="signed_addendum",
            signed_by_tenant_at=_now(),
            signed_by_landlord_at=_now(),
        )
        assert friendly_download_filename(att) == "Pet Addendum.pdf"

    def test_filename_with_no_extension_still_gets_suffix(self) -> None:
        att = _FakeAttachment(
            filename="Lease Agreement",
            kind="signed_lease",
            signed_by_tenant_at=_now(),
        )
        assert (
            friendly_download_filename(att)
            == "Lease Agreement - tenant signed"
        )

    def test_filename_with_multiple_dots_only_swaps_final_extension(self) -> None:
        att = _FakeAttachment(
            filename="2026.05.07 Lease Agreement.pdf",
            kind="signed_lease",
            signed_by_tenant_at=_now(),
        )
        assert (
            friendly_download_filename(att)
            == "2026.05.07 Lease Agreement - tenant signed.pdf"
        )

    def test_empty_filename_returns_empty(self) -> None:
        att = _FakeAttachment(
            filename="",
            kind="signed_lease",
            signed_by_tenant_at=_now(),
        )
        assert friendly_download_filename(att) == ""

    def test_dotfile_only_returns_unchanged_to_avoid_empty_stem(self) -> None:
        # ``os.path.splitext('.docx')`` returns ('.docx', '') — stem is
        # empty. Defensive fallback: don't synthesize a name, return as-is.
        att = _FakeAttachment(
            filename=".docx",
            kind="signed_lease",
            signed_by_tenant_at=_now(),
        )
        assert friendly_download_filename(att) == ".docx"
