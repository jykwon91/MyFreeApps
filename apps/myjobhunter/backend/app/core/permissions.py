"""MJH permission dependencies.

MJH does not have a multi-tier user role system in product use today —
the ``Role.ADMIN`` enum value comes from ``platform_shared`` and exists
for parity with MBK, but MJH's admin-only surface area (demo accounts,
invites, user management) is gated on ``is_superuser`` instead. The
operator is the sole superuser; everyone else is a regular user.

Provides:
    - ``current_superuser`` — gate on ``user.is_superuser is True``
    - ``current_admin`` — kept as a back-compat alias resolving to
      ``current_superuser`` so any code still importing the old name
      keeps working without changes
"""
from __future__ import annotations

from fastapi import Depends, HTTPException

from app.core.auth import current_active_user
from app.models.user.user import User


async def current_superuser(user: User = Depends(current_active_user)) -> User:
    """Allow only users with ``is_superuser=True``.

    Returns the user when the gate passes; raises 403 otherwise. Mirrors
    apps/mybookkeeper/backend/app/core/permissions.py:current_superuser
    so the two apps stay shape-aligned even though MJH only ever uses
    this dependency (no role-based admin tier).
    """
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser access required")
    return user


# Back-compat alias. Existing code that imports ``current_admin`` keeps
# resolving to the same dependency. New code should import
# ``current_superuser`` directly.
current_admin = current_superuser
