from platform_shared.core.email_header_utils import strip_line_breaks


def test_line_breaks_become_spaces() -> None:
    assert strip_line_breaks("x\nBcc: y") == "x Bcc: y"
    assert strip_line_breaks("a\r\nb\rc") == "a b c"


def test_unicode_line_separators_are_stripped() -> None:
    assert strip_line_breaks("a b\x85c") == "a b c"


def test_plain_value_is_unchanged() -> None:
    assert strip_line_breaks("Jane O'Neil — Lease") == "Jane O'Neil — Lease"


def test_trailing_break_is_dropped() -> None:
    assert strip_line_breaks("subject\n") == "subject"
