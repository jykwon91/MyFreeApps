"""Pydantic schemas for organization API."""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr


class InviteInfoResponse(BaseModel):
    org_name: str
    org_role: str
    inviter_name: str
    email: str
    expires_at: datetime
    is_expired: bool
    user_exists: bool  # whether the invitee already has an account


class OrganizationCreate(BaseModel):
    name: str


class OrganizationUpdate(BaseModel):
    name: str


class OrganizationRead(BaseModel):
    id: uuid.UUID
    name: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MemberRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    org_role: str
    joined_at: datetime
    user_email: str | None = None
    user_name: str | None = None

    model_config = {"from_attributes": True}


class InviteCreate(BaseModel):
    email: EmailStr
    org_role: Literal["admin", "user", "viewer"]


class InviteRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    email: str
    org_role: str
    status: str
    email_sent: bool
    created_at: datetime
    expires_at: datetime

    model_config = {"from_attributes": True}


class MemberRoleUpdate(BaseModel):
    org_role: Literal["admin", "user", "viewer"]


class OrgWithRole(BaseModel):
    """Organization with the current user's role in it."""
    id: uuid.UUID
    name: str
    org_role: str
    is_demo: bool
    created_at: datetime

    model_config = {"from_attributes": True}
