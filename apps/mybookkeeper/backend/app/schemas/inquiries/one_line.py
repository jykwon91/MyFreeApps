"""An email Subject header can't hold a line break, so subjects are checked before they get that far."""
from app.core.line_break_utils import has_line_break


def require_one_line(value: str) -> str:
    if has_line_break(value):
        raise ValueError("The subject must be one line")
    return value
