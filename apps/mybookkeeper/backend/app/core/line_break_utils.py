"""What counts as a line break: exactly what ``str.splitlines`` splits on.

The email library refuses a header that ``splitlines`` would break in two, so a
subject has to be free of all of these, not only CR and LF.
"""
import re

_LINE_BREAKS = "\r\n\v\f\x1c\x1d\x1e\x85  "
_ANY_LINE_BREAK = re.compile(f"[{_LINE_BREAKS}]")
_LINE_BREAK_RUN = re.compile(rf"[ \t]*[{_LINE_BREAKS}]+\s*")


def has_line_break(text: str) -> bool:
    return _ANY_LINE_BREAK.search(text) is not None


def collapse_line_breaks(text: str) -> str:
    """Join the lines with single spaces, dropping the spaces around each break."""
    return _LINE_BREAK_RUN.sub(" ", text).strip()
