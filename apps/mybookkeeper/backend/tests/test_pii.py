"""Tests for PII masking utility."""
import pytest

import re
from pathlib import Path

from app.core.pii import PII_FIELD_IDS, has_mask_token, has_pii_pattern, is_masked_pii, mask_pii


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


class TestIsMaskedPii:
    @pytest.mark.parametrize("field_id", sorted(PII_FIELD_IDS))
    def test_detects_own_mask_output(self, field_id: str) -> None:
        assert is_masked_pii(field_id, str(mask_pii(field_id, "123456789")))
        assert is_masked_pii(field_id, str(mask_pii(field_id, "12")))

    def test_real_pii_value_is_not_masked(self) -> None:
        assert not is_masked_pii("ssn", "123-45-6789")
        assert not is_masked_pii("recipient_tin", "123456789")

    def test_non_pii_field_is_never_masked(self) -> None:
        assert not is_masked_pii("box_14", "***1234")


class TestMaskTokens:
    def test_detects_tokens_mask_pii_writes_in_free_text(self) -> None:
        masked = str(mask_pii("box_14", "SSN 123-45-6789 and TIN 123456789"))
        assert has_mask_token(masked)

    def test_plain_text_has_no_mask_token(self) -> None:
        assert not has_mask_token("Spouse SSN 123-45-6789")
        assert not has_mask_token("12 *** 34")

    def test_has_pii_pattern(self) -> None:
        assert has_pii_pattern("SSN 123-45-6789")
        assert has_pii_pattern("TIN 123456789")
        assert not has_pii_pattern("TX")


_WEB_CONFIG = (
    Path(__file__).resolve().parents[2]
    / "api-client" / "src" / "constants" / "taxFormFields.ts"
)


def test_web_pii_fields_match_backend() -> None:
    source = _WEB_CONFIG.read_text()
    block = re.search(r"PII_FIELDS[^=]*=\s*new Set\(\[(.*?)\]\)", source, re.S)
    assert block is not None
    assert set(re.findall(r'"([a-z_]+)"', block.group(1))) == set(PII_FIELD_IDS)
