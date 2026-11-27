"""Putting someone else's plain text into an HTML email (app.core.html_text)."""
from __future__ import annotations

import pytest

from app.core.html_text import text_to_html


def test_markup_is_escaped_quotes_included() -> None:
    assert text_to_html('<img src=x onerror="a()"> & \'b\'') == (
        "&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#x27;b&#x27;"
    )


@pytest.mark.parametrize("text", ["one\ntwo", "one\r\ntwo", "one\rtwo"])
def test_every_kind_of_line_break_becomes_br(text: str) -> None:
    assert text_to_html(text) == "one<br>two"


def test_blank_lines_are_kept() -> None:
    assert text_to_html("one\n\ntwo") == "one<br><br>two"


def test_plain_text_is_unchanged() -> None:
    assert text_to_html("Paid, thanks!") == "Paid, thanks!"
