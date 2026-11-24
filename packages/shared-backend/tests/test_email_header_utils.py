from platform_shared.core.email_header_utils import strip_line_breaks, unique_addresses


def test_line_breaks_become_spaces() -> None:
    assert strip_line_breaks("x\nBcc: y") == "x Bcc: y"
    assert strip_line_breaks("a\r\nb\rc") == "a b c"


def test_unicode_line_separators_are_stripped() -> None:
    assert strip_line_breaks("a b\x85c") == "a b c"


def test_plain_value_is_unchanged() -> None:
    assert strip_line_breaks("Jane O'Neil — Lease") == "Jane O'Neil — Lease"


def test_trailing_break_is_dropped() -> None:
    assert strip_line_breaks("subject\n") == "subject"


def test_exact_repeats_are_dropped_in_first_order() -> None:
    addresses = ["b@example.com", "a@example.com", "b@example.com", " a@example.com\r\n"]
    assert unique_addresses(addresses) == ["b@example.com", "a@example.com"]


def test_addresses_that_differ_at_all_are_kept() -> None:
    # The part before the @ may be case-sensitive (RFC 5321 section 2.4).
    addresses = ["a@example.com", "A@example.com", "a@EXAMPLE.com", "Jane <a@example.com>"]
    assert unique_addresses(addresses) == addresses
