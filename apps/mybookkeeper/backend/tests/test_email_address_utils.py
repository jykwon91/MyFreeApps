import pytest

from app.core.email_address_utils import is_plain_email_address


@pytest.mark.parametrize(
    ("value", "plain"),
    [
        ("host@gmail.com", True),
        ("h.ost+rent@example.co.uk", True),
        ("Host <host@gmail.com>", False),
        ("host@gmail.com\r\nBcc: x@evil.com", False),
        ("host@gmail.com\n", False),
        ("host @gmail.com", False),
        ("hostgmail.com", False),
        ("@gmail.com", False),
        ("host@", False),
        ("a@b@c.com", False),
        ("host@gmail.com,other@gmail.com", False),
    ],
)
def test_only_a_bare_address_counts(value: str, plain: bool) -> None:
    assert is_plain_email_address(value) is plain
