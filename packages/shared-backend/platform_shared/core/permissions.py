"""Platform-level role enum + admin dependency.

Foundation slice of the broader RBAC contract. Apps that need the full
organization + members + per-org roles tier can layer on top of this
in their own ``app/core/permissions.py`` (see
apps/mybookkeeper/backend/app/core/permissions.py for the canonical
example), but the simple "is the user a platform admin" check
belongs here so every app gets it for free.

Scope of THIS module:

  - ``Role`` enum (ADMIN | USER) — single column on the User table
  - ``require_role(*roles)`` dependency factory
  - ``current_admin`` — pre-baked dependency for admin-only routes

Explicitly NOT in scope (belongs in app-level permissions.py):

  - Organization / OrganizationMember / OrgRole
  - ``current_org_member`` and ``require_write_access`` /
    ``require_org_role`` dependencies
  - Demo-org rejection helpers
  - Anything that reads the X-Organization-Id header

This module has zero coupling to any organization schema. The single
``user.role`` column is sufficient to enforce platform-level admin
gates for routes like ``/admin/auth-events``, ``/admin/storage-health``,
or ``/admin/users``.

Apps must declare a ``role`` column on their User model that uses
this enum:

    from platform_shared.core.permissions import Role

    class User(SQLAlchemyBaseUserTableUUID, Base):
        role: Mapped[Role] = mapped_column(SAEnum(Role), default=Role.USER)
"""
from __future__ import annotations

import enum
from typing import Awaitable, Callable, Protocol

from fastapi import Depends, HTTPException


class Role(str, enum.Enum):
    """Platform-level user role.

    Apps that need finer-grained per-organization roles should layer
    those in their own permissions module on top of this one — keep
    the platform-level enum minimal.
    """

    ADMIN = "admin"
    USER = "user"


class _RoleHolder(Protocol):
    """Anything with a ``role`` attribute exposing a ``Role``.

    Used to type the ``require_role`` factory's dependency without
    coupling to any specific User model — apps' own User class
    satisfies this Protocol structurally.
    """

    role: Role


def require_role(
    *roles: Role,
    current_active_user: Callable[..., Awaitable[_RoleHolder]],
) -> Callable[..., Awaitable[_RoleHolder]]:
    """Build a FastAPI dependency that gates a route on user.role.

    Args:
        *roles: Allowed Role values. The user's role must be in this
            set or the dependency raises 403.
        current_active_user: The app's ``current_active_user``
            dependency from fastapi-users — passed in so this module
            stays decoupled from any specific User model. Each app
            wires its own.

    Example (in app/core/permissions.py):

        from platform_shared.core.permissions import Role, require_role
        from app.core.auth import current_active_user

        require_admin = require_role(Role.ADMIN, current_active_user=current_active_user)

    Then in route handlers:

        @router.get("/admin/auth-events", dependencies=[Depends(require_admin)])
        async def list_auth_events(...): ...

    Raises:
        HTTPException 403 with detail "Insufficient permissions" when
        the user's role is not in the allowed set.
    """

    async def _check(user: _RoleHolder = Depends(current_active_user)) -> _RoleHolder:
        if user.role not in roles:
            raise HTTPException(
                status_code=403, detail="Insufficient permissions"
            )
        return user

    return _check
