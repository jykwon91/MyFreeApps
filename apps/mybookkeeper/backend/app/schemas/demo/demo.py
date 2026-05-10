import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class DemoCredentials(BaseModel):
    email: EmailStr
    password: str


class DemoCreateRequest(BaseModel):
    tag: str = Field(min_length=1, max_length=100, pattern=r"^[\w\s\-\.]+$")
    recipient_email: EmailStr | None = Field(default=None, description="Email address to send login invite to")


class DemoCreateResponse(BaseModel):
    message: str
    credentials: DemoCredentials
    email_sent: bool = False


class DemoResetResponse(BaseModel):
    message: str
    email: EmailStr
    password: str


class DemoUserSummary(BaseModel):
    user_id: uuid.UUID
    email: EmailStr
    tag: str
    organization_id: uuid.UUID
    organization_name: str
    created_at: datetime
    upload_count: int


class DemoUserListResponse(BaseModel):
    users: list[DemoUserSummary]
    total: int


class DemoDeleteResponse(BaseModel):
    message: str
