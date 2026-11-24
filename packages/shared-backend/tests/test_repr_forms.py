"""repr_forms: how ``repr`` writes a string that is part of a longer one."""

from __future__ import annotations

import pytest

from platform_shared.core.repr_forms import repr_forms


@pytest.mark.parametrize(
    "text",
    [
        "plain text",
        "it's here",
        'say "hi"',
        'it\'s "both"',
        "a\\'b",
        "two\nlines",
        "a tab\tand a \\ backslash",
    ],
)
def test_each_form_is_what_repr_writes_in_a_longer_string(text: str) -> None:
    quoted_with_apostrophes, quoted_with_double_quotes = repr_forms(text)
    # A string holding both kinds of quote is quoted with '.
    assert repr(f"\"'{text}") == f"'\"\\'{quoted_with_apostrophes}'"
    # A string holding a ' and no " is quoted with ". The text can only be
    # part of one if it holds no ".
    if '"' not in text:
        assert repr(f"'{text}") == f"\"'{quoted_with_double_quotes}\""
