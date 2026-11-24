"""Make header values and recipient addresses safe for outgoing email."""
from collections.abc import Sequence


def strip_line_breaks(value: str) -> str:
    """Replace every line break in a header value or address with a space.

    A line break followed by ``Name:`` would start a new header (header
    injection: a user-typed name of ``"x\\nBcc: someone"`` adding a recipient),
    and the email package refuses to serialize it. Names and subjects come from
    user input, so they are flattened to one line before any header is built.
    """
    return " ".join(value.splitlines()).strip()


def unique_addresses(addresses: Sequence[str]) -> list[str]:
    """``addresses`` with line breaks stripped (see ``strip_line_breaks``) and
    exact repeats dropped, in the order they first appear.

    Addresses that differ in any way, such as letter case or a display name,
    are all kept: the part before the @ may be case-sensitive (RFC 5321
    section 2.4).
    """
    return list(dict.fromkeys(strip_line_breaks(address) for address in addresses))
