"""Parse an ``If-Match`` header carrying a story's ``updated_at`` (ISO 8601).

Pure. Accepts the bare timestamp or an ETag-style quoted one. Returns None
when the header is absent; raises ValueError when it isn't a timezone-aware
ISO timestamp.
"""
from datetime import datetime


def parse_if_match(raw: str | None) -> datetime | None:
    if raw is None or not raw.strip():
        return None
    value = raw.strip().removeprefix("W/").strip('"')
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("If-Match must include a timezone")
    return parsed
