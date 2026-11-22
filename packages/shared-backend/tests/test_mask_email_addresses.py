"""``mask_email_addresses`` cuts every address in a piece of text to its domain."""
import pytest
from platform_shared.core.mask_email_addresses import mask_email_addresses


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (
            "(550, b'5.1.1 <jane.doe@example.com>: Recipient address rejected')",
            "(550, b'5.1.1 <***@example.com>: Recipient address rejected')",
        ),
        ("to=a@example.com,b+x@mail.example.org", "to=***@example.com,***@mail.example.org"),
        ("RCPT TO:<jos\\xe9@example.com>", "RCPT TO:<***@example.com>"),
        ("no address here, just @mentions and 2026-11-21", "no address here, just @mentions and 2026-11-21"),
        ("refused jane@b\u00fccher.de", "refused ***@b\u00fccher.de"),
        ("b'<jane@b\\xc3\\xbccher.de>: rejected'", "b'<***@b\\xc3\\xbccher.de>: rejected'"),
        ('550 <"jane doe"@example.com> refused', "550 <***@example.com> refused"),
        ('to "jane doe"@example.com.', "to ***@example.com."),
        ("<jane@localhost>: unknown user", "<***@localhost>: unknown user"),
        ("installed pkg@latest and node@18", "installed pkg@latest and node@18"),
        ("see https://bob@example.com/path?q=1", "see https://***@example.com/path?q=1"),
        ("", ""),
    ],
)
def test_mask_email_addresses(text: str, expected: str) -> None:
    assert mask_email_addresses(text) == expected


def test_is_idempotent() -> None:
    once = mask_email_addresses("from bob@example.com")
    assert mask_email_addresses(once) == once == "from ***@example.com"
