"""smtp_setting_faults: which SMTP settings can't work, by name."""

from __future__ import annotations

from platform_shared.core.smtp_setting_faults import (
    non_ascii_smtp_settings,
    unset_smtp_settings,
)


def test_every_empty_setting_is_named_in_order() -> None:
    assert unset_smtp_settings(host="", user="", password="") == [
        "SMTP_HOST",
        "SMTP_USER",
        "SMTP_PASSWORD",
    ]
    assert unset_smtp_settings(host="smtp.example.com", user="", password="x") == ["SMTP_USER"]


def test_nothing_is_named_when_every_setting_is_set() -> None:
    assert unset_smtp_settings(host="smtp.example.com", user="u", password="p") == []


def test_a_non_ascii_login_setting_is_named() -> None:
    assert non_ascii_smtp_settings(user="j\u00f6rg@example.com", password="p\u00e4ss") == [
        "SMTP_USER",
        "SMTP_PASSWORD",
    ]
    assert non_ascii_smtp_settings(user="user@example.com", password="p\u00a0ss") == ["SMTP_PASSWORD"]


def test_an_ascii_or_empty_login_is_not_named() -> None:
    assert non_ascii_smtp_settings(user="user@example.com", password="") == []
