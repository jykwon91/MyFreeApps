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

from platform_shared.core.permissions import make_current_superuser

from app.core.auth import current_active_user

current_superuser = make_current_superuser(current_active_user)

# Back-compat alias. Existing code that imports ``current_admin`` keeps
# resolving to the same dependency. New code should import
# ``current_superuser`` directly.
current_admin = current_superuser
