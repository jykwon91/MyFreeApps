"""Computed-state enum for an invite row.

The DB doesn't store this directly — the row's accepted_at / expires_at
columns are the source of truth. This enum is the API-surface
projection: every row is exactly one of these, every time, derived by
``InviteService.compute_status``.
"""
from __future__ import annotations

from enum import Enum


class InviteStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
