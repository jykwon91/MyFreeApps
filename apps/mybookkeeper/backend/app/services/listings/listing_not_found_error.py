"""A listing the caller asked for can't be reached — HTTP 404."""


class ListingNotFoundError(LookupError):
    """Listing missing, soft-deleted, or out of the caller's organization.

    Routes catch this type, not ``LookupError``: SQLAlchemy raises a plain
    ``LookupError`` when a stored enum value isn't one the code knows, and
    that is a server fault to fail loud as a 500, not a missing listing.
    """
