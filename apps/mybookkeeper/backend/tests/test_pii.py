"""Tests for PII masking utility."""
import pytest

from app.core.pii import PII_FIELD_IDS, mask_pii


class TestMaskPiiKnownFields:
    """Known PII field IDs should be fully masked except last 4 chars."""

    @pytest.mark.parametrize("field_id", sorted(PII_FIELD_IDS))
    def test_masks_known_field_with_ssn(self, field_id: str) -> None:
        result = mask_pii(field_id, "123-45-6789")
        assert result == "***6789"

    @pytest.mark.parametrize("field_id", sorted(PII_FIELD_IDS))
    def test_masks_known_field_with_tin(self, field_id: str) -> None:
        result = mask_pii(field_id, "123456789")
        assert result == "***6789"

    def test_masks_short_value(self) -> None:
        result = mask_pii("ssn", "12")
        assert result == "****"

    def test_masks_exactly_4_chars(self) -> None:
        result = mask_pii("ssn", "1234")
        assert result == "***1234"


class TestMaskPiiNone:
    def test_returns_none_for_none(self) -> None:
        assert mask_pii("ssn", None) is None

    def test_returns_none_for_non_pii_field(self) -> None:
        assert mask_pii("line_3", None) is None


class TestMaskPiiUnknownFields:
    """Non-PII fields should only scan for SSN/TIN patterns in text."""

    def test_passes_through_normal_text(self) -> None:
        assert mask_pii("line_3", "Hello world") == "Hello world"

    def test_passes_through_numeric(self) -> None:
        assert mask_pii("line_3", 42500.00) == 42500.00

    def test_masks_ssn_pattern_in_text(self) -> None:
        result = mask_pii("description", "SSN is 123-45-6789 here")
        assert result == "SSN is ***-**-6789 here"

    def test_masks_tin_pattern_in_text(self) -> None:
        result = mask_pii("description", "TIN: 123456789")
        assert result == "TIN: *****6789"

    def test_masks_multiple_ssns_in_text(self) -> None:
        result = mask_pii("notes", "A: 111-22-3333, B: 444-55-6666")
        assert result == "A: ***-**-3333, B: ***-**-6666"

    def test_does_not_mask_non_ssn_numbers(self) -> None:
        result = mask_pii("line_3", "Amount: $12,345.67")
        assert result == "Amount: $12,345.67"

    def test_does_not_mask_boolean(self) -> None:
        assert mask_pii("is_active", True) is True

    def test_does_not_mask_integer(self) -> None:
        assert mask_pii("line_3", 100) == 100
