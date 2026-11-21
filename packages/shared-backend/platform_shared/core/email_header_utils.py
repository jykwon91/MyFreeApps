"""Header-safety helpers for building outgoing email."""


def strip_line_breaks(value: str) -> str:
    """Replace every line break in a header value or address with a space.

    A line break followed by ``Name:`` would start a new header (header
    injection: a user-typed name of ``"x\\nBcc: someone"`` adding a recipient),
    and the email package refuses to serialize it. Names and subjects come from
    user input, so they are flattened to one line before any header is built.
    """
    return " ".join(value.splitlines()).strip()
