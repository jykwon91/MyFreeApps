"""Lookup tests for the disposable email blocklist (T0)."""
from __future__ import annotations

from platform_shared.core.disposable_email_domains import (
    DISPOSABLE_EMAIL_DOMAINS,
    is_disposable_email,
)


def test_known_disposable_blocked() -> None:
    assert is_disposable_email("user@mailinator.com") is True
    assert is_disposable_email("test@yopmail.com") is True
    assert is_disposable_email("foo@10minutemail.com") is True


def test_legitimate_domain_not_blocked() -> None:
    assert is_disposable_email("real-user@gmail.com") is False
    assert is_disposable_email("alice@company.com") is False


def test_case_insensitive() -> None:
    assert is_disposable_email("USER@MAILINATOR.COM") is True
    assert is_disposable_email("user@MailInator.Com") is True


def test_invalid_email_returns_false() -> None:
    assert is_disposable_email("") is False
    assert is_disposable_email("no-at-sign") is False
    assert is_disposable_email("@") is False


def test_blocklist_is_non_empty() -> None:
    # Sanity check — if someone accidentally truncates the literal, we'll see it.
    assert len(DISPOSABLE_EMAIL_DOMAINS) > 100
