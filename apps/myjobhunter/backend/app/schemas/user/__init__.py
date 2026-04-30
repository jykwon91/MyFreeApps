"""User-domain Pydantic schemas.

Re-exports the fastapi-users base schemas (UserCreate, UserRead, UserUpdate)
from :mod:`app.schemas.user.user_base` so existing call sites
``from app.schemas.user import UserCreate, UserRead, UserUpdate`` keep working.
"""
from app.schemas.user.user_base import UserCreate, UserRead, UserUpdate

__all__ = ["UserCreate", "UserRead", "UserUpdate"]
