"""Pydantic schemas for the shared admin user-management API.

Used by ``platform_shared.api.admin_router`` and the corresponding
service layer. Apps that need richer per-app user fields can subclass
``AdminUserRead`` in their own schemas module — the shared router
returns this minimal shape that's identical across all apps.
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from platform_shared.core.permissions import Role


class AdminUserRead(BaseModel):
    """Minimal user shape returned by /admin/users endpoints.

    Field set is intentionally the intersection of every app's User
    model — id, email, name, role, plus the three fastapi-users boolean
    flags. Apps where the column is named ``display_name`` (e.g. MJH)
    expose a ``name`` Python property so this schema serializes
    identically across apps.
    """

    id: uuid.UUID
    email: EmailStr
    name: str | None = None
    role: Role
    is_active: bool
    is_superuser: bool
    is_verified: bool

    model_config = ConfigDict(from_attributes=True)


class AdminUserRoleUpdate(BaseModel):
    """Body for PATCH /admin/users/{id}/role."""

    role: Role


class SuperuserToggleRequest(BaseModel):
    """Body for PATCH /admin/users/{id}/superuser.

    Step-up auth: the calling admin must supply a current TOTP code
    (or a recovery code) along with the toggle. The router's
    ``step_up_verify`` callable validates it against the admin's
    enrolled secret. A leaked session token alone is NOT sufficient
    to flip the most-privileged flag in the system.
    """

    totp_code: str = Field(
        ...,
        min_length=1,
        max_length=20,
        description=(
            "Current 6-digit TOTP code or a recovery code from the "
            "calling admin's authenticator. Required."
        ),
    )


class UserStats(BaseModel):
    """Per-app summary of user-table counts.

    Returned by the shared ``GET /admin/stats/users`` endpoint and used
    as a sub-field by app-specific stats endpoints (e.g. MBK's
    ``/admin/stats`` extends with org/transaction/document counts).
    """

    total_users: int
    active_users: int
    inactive_users: int
