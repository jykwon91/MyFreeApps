"""Truncate Gmail header values to DB column widths."""


def truncate_header(value: str | None, max_len: int) -> str | None:
    """Match a Gmail header value to a DB column width without raising."""
    if value is None:
        return None
    return value if len(value) <= max_len else value[:max_len]
