from email.utils import parseaddr


def is_plain_email_address(value: str) -> bool:
    """True for a bare ``local@domain``: no display name, spaces or control characters.

    Safe to put in an email header as-is.
    """
    if any(c.isspace() or not c.isprintable() for c in value):
        return False
    name, address = parseaddr(value)
    local, at, domain = value.partition("@")
    return name == "" and address == value and bool(at and local and domain) and "@" not in domain
