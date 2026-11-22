"""``mask_email`` keeps only an address's domain."""
import pytest
from platform_shared.core.mask_email import MASKED_EMAIL_UNKNOWN, mask_email


@pytest.mark.parametrize(
    ("address", "expected"),
    [
        ("jane.doe@example.com", "***@example.com"),
        ("Jane@Example.COM ", "***@example.com"),
        ("a@b@example.org", "***@example.org"),
        ("***@example.com", "***@example.com"),
        ("no-at-sign", MASKED_EMAIL_UNKNOWN),
        ("jane@", MASKED_EMAIL_UNKNOWN),
        ("", MASKED_EMAIL_UNKNOWN),
    ],
)
def test_mask_email(address: str, expected: str) -> None:
    assert mask_email(address) == expected
