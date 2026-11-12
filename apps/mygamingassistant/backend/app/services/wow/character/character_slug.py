"""A Forever character's Blizzard address: ``first-surname``, lowercase."""
from app.core.wow_character import CHARACTER_SLUG_PATTERN


def normalize_character_slug(raw: str) -> str | None:
    """The slug lowercased, or None when it isn't two names of letters joined by "-"."""
    slug = raw.strip().lower()
    return slug if CHARACTER_SLUG_PATTERN.fullmatch(slug) else None
