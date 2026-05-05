"""MJH permission dependencies.

Thin wrapper around ``platform_shared.core.permissions.require_role``
that wires in MJH's ``current_active_user`` (from
``app.core.auth``). Mirrors apps/mybookkeeper/backend/app/core/permissions.py.

Provides:
    - ``require_admin`` — gate on ``Role.ADMIN``
    - ``current_admin`` — alias for the ``require_admin`` dependency
"""
from __future__ import annotations

from platform_shared.core.permissions import Role, require_role

from app.core.auth import current_active_user

require_admin = require_role(Role.ADMIN, current_active_user=current_active_user)

# Alias kept for symmetry with MBK's permissions module — code that
# already imports ``current_admin`` resolves to the same dependency.
current_admin = require_admin
