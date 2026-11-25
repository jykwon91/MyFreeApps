"""``seed_env --check``'s SMTP checks: what the email boot guard would refuse.
Standard library only, like ``seed_env``, which runs on the VPS host's bare ``python3``."""
from __future__ import annotations

from pathlib import Path

from platform_shared.core.smtp_setting_faults import (
    non_ascii_smtp_settings,
    unset_smtp_settings,
)


def smtp_problems(
    current: dict[str, str], raw: dict[str, str], path: Path, reported: list[str],
) -> list[str]:
    """With EMAIL_BACKEND=smtp, the SMTP settings the boot guard would refuse,
    by name only: an empty host, user or password, and a login that isn't
    ASCII. Never prints a value. Skips a BLANK line ``reported`` already has.

    The ASCII test reads ``raw`` (values as written), so a trailing
    non-breaking space that ``current``'s stripping removed is still caught."""
    if current.get("EMAIL_BACKEND", "") != "smtp":
        return []
    host, user, password = (current.get(k, "") for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"))
    blanks = [f"BLANK {name} in {path}" for name in unset_smtp_settings(host=host, user=user, password=password)]
    not_ascii = [
        f"NOT ASCII {name} in {path} (smtplib sends the SMTP login as ASCII)"
        for name in non_ascii_smtp_settings(user=raw.get("SMTP_USER", ""), password=raw.get("SMTP_PASSWORD", ""))
    ]
    return [line for line in blanks if line not in reported] + not_ascii
