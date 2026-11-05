"""The line-break rule has to match the one the email library enforces on headers."""
import sys
from email.message import EmailMessage

import pytest

from app.core.line_break_utils import collapse_line_breaks, has_line_break

EVERY_LINE_BREAK = [chr(c) for c in range(sys.maxunicode + 1) if len(f"a{chr(c)}b".splitlines()) > 1]


def test_it_counts_exactly_what_splitlines_splits_on() -> None:
    found = [chr(c) for c in range(sys.maxunicode + 1) if has_line_break(f"a{chr(c)}b")]
    assert found == EVERY_LINE_BREAK


@pytest.mark.parametrize("line_break", EVERY_LINE_BREAK, ids=lambda c: f"U+{ord(c):04X}")
def test_a_collapsed_subject_is_a_header_the_email_library_accepts(line_break: str) -> None:
    subject = collapse_line_breaks(f"Re: Cozy {line_break}{line_break} Room{line_break}")
    message = EmailMessage()
    message["Subject"] = subject
    assert subject == "Re: Cozy Room"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("One line", "One line"),
        ("Re:\r\n  Cozy\tRoom", "Re: Cozy\tRoom"),
        ("\nRe: Cozy Room\n", "Re: Cozy Room"),
        ("Re:  two  spaces", "Re:  two  spaces"),
    ],
)
def test_collapsing_leaves_the_spacing_within_a_line_alone(text: str, expected: str) -> None:
    assert collapse_line_breaks(text) == expected
