"""A property the caller named can't be reached — HTTP 404."""


class PropertyNotFoundError(LookupError):
    """Property missing or out of the caller's organization.

    Routes catch this type, not ``LookupError``: loading a property whose
    stored ``classification`` or ``type`` isn't a value the code knows makes
    SQLAlchemy raise a plain ``LookupError``. That is a server fault to fail
    loud as a 500 with the real error logged, not a missing property.
    """
