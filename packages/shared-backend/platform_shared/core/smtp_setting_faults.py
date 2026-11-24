"""Which SMTP settings can't work, by name. Stdlib only, so the boot guard and
EmailService share it without either importing the other."""

from __future__ import annotations


def unset_smtp_settings(*, host: str, user: str, password: str) -> list[str]:
    """The names of the SMTP settings that are empty, in the order the env files list them."""
    settings = (("SMTP_HOST", host), ("SMTP_USER", user), ("SMTP_PASSWORD", password))
    return [name for name, value in settings if not value]


def non_ascii_smtp_settings(*, user: str, password: str) -> list[str]:
    """The names of the SMTP login settings smtplib can't send: it sends the login as ASCII."""
    settings = (("SMTP_USER", user), ("SMTP_PASSWORD", password))
    return [name for name, value in settings if not value.isascii()]
