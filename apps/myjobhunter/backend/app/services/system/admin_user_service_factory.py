"""Factory: instantiate the shared ``AdminUserService`` for MJH.

Mirrors apps/mybookkeeper/backend/app/services/system/admin_user_service_factory.py.
A module-level instance is created at import time so the shared admin
router can be wired in ``app.main`` without re-resolving the deps on
every request.
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
