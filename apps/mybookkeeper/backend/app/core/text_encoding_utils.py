"""Checks on whether text can be turned into bytes."""


def is_utf8_encodable(value: str) -> bool:
    """False for text holding a lone surrogate (``"\\ud800"``), which JSON allows but UTF-8 can't encode."""
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True
