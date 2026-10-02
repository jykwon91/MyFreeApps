"""Role lists the raid bot keeps — what a role menu picked, and what a stored list holds.

Raid: Unsigned's roles checked, the server's raider roles, and Advanced's
"Who can sign up" lists all hold role ids as strings: never ``@everyone``
(its id is the server's own), never twice, at most ``MAX_ROLES``.  Pure.
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Final

# The most roles a list holds (the role menus' limit too).
MAX_ROLES: Final = 10


def picked_roles(values: Sequence[str], *, everyone_id: str | None) -> tuple[list[str], bool]:
    """The roles a role menu picked, up to ``MAX_ROLES``, and whether ``@everyone`` was among them (left out)."""
    roles: list[str] = []
    everyone = False
    for value in values:
        if value == everyone_id:
            everyone = True
        elif value.isascii() and value.isdigit() and value not in roles:
            roles.append(value)
    return roles[:MAX_ROLES], everyone


def stored_roles(role_ids: Iterable[object], everyone_id: str) -> tuple[str, ...]:
    """*role_ids* as strings, without ``@everyone`` or repeats, the first ``MAX_ROLES``."""
    kept: list[str] = []
    for role_id in map(str, role_ids):
        if role_id != everyone_id and role_id not in kept:
            kept.append(role_id)
    return tuple(kept[:MAX_ROLES])
