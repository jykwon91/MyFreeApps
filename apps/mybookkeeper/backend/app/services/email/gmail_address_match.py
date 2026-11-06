"""Compare the Gmail address a send claim went through with the connected one."""
from __future__ import annotations


def same_gmail_address(a: str, b: str) -> bool:
    """Case- and whitespace-insensitive only.

    Dots and ``+tags`` are left alone: they name the same Gmail mailbox but not
    the same Google Workspace one, and a wrong "same" would resend an email.
    """
    return a.strip().casefold() == b.strip().casefold()
