"""Factory: instantiate the shared ``AdminUserService`` for the app.

Mirrors apps/myjobhunter/backend/app/services/system/admin_user_service_factory.py.
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
