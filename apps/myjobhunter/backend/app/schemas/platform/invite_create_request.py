"""Request body for ``POST /admin/invites``."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr


class InviteCreateRequest(BaseModel):
    email: EmailStr
