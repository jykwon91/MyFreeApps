"""The email that hands a tenant's reply to their landlord: subject and HTML body."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ReplyEmail:
    subject: str
    html: str
