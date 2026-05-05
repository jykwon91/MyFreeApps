"""Factory: instantiate the shared ``AdminUserService`` for MBK.

A single module-level instance is created at import time so the rest
of the codebase can ``from ... import shared_admin_user_service`` and
call methods directly without re-wiring the dependencies on every
call site. The shared admin router (mounted in ``app.main``) consumes
this same instance.
"""
from __future__ import annotations

from platform_shared.services.admin_user_service import AdminUserService

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.user.user import User

shared_admin_user_service: AdminUserService[User] = AdminUserService(
    user_model=User,
    unit_of_work=unit_of_work,
    async_session_factory=AsyncSessionLocal,
)
