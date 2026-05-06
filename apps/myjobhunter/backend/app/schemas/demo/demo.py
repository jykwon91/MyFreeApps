"""Pydantic schemas for the admin demo-management API.

Demo accounts are showcase/sandbox MJH users seeded with realistic dummy
data so an operator can demo the app to a stranger without hand-crafting
applications/companies/profile content. These schemas are consumed only
by the admin-gated routes in ``app.api.demo``.

Mirrors the MBK demo schema shape (``apps/mybookkeeper/backend/app/schemas/
demo/demo.py``) with two divergences:

  1. MJH has no orgs — the response shape carries ``user_id`` /
     ``email`` / ``display_name`` directly rather than an
     ``organization_id`` / ``organization_name`` pair.
  2. The summary carries application + company counts rather than upload
     counts — the meaningful "how much demo data does this account
     have" signal for MJH.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class DemoCredentials(BaseModel):
    """Login credentials returned ONCE at demo-user creation time.

    The plaintext password is never stored in plaintext anywhere
    reachable later — fastapi-users hashes it before persistence and
    this object is the single emission point. The admin UI surfaces it
    in a one-time modal with a copy button; if the operator dismisses
    that modal without copying, the only recovery is to delete +
    recreate the demo account.
    """

    email: EmailStr
    password: str


class DemoCreateRequest(BaseModel):
    """Body of ``POST /admin/demo/users``.

    ``email`` is optional — when omitted the service auto-generates a
    ``demo+<uuid>@myjobhunter.local`` address. ``display_name`` is
    optional — when omitted the service synthesizes a plausible name
    from the seed data.
    """

    email: EmailStr | None = Field(
        default=None,
        description=(
            "Optional. Demo account email. Auto-generated as "
            "'demo+<uuid>@myjobhunter.local' when omitted."
        ),
    )
    display_name: str | None = Field(
        default=None,
        max_length=100,
        description=(
            "Optional. Display name for the demo user. Defaults to the "
            "seeded profile's 'Alex Demo'."
        ),
    )


class DemoCreateResponse(BaseModel):
    """Body of a successful ``POST /admin/demo/users`` response."""

    message: str
    credentials: DemoCredentials
    user_id: uuid.UUID


class DemoUserSummary(BaseModel):
    """One row in the admin demo-users list."""

    user_id: uuid.UUID
    email: EmailStr
    display_name: str
    created_at: datetime
    application_count: int
    company_count: int


class DemoUserListResponse(BaseModel):
    """Body of ``GET /admin/demo/users``."""

    users: list[DemoUserSummary]
    total: int


class DemoDeleteResponse(BaseModel):
    """Body of ``DELETE /admin/demo/users/{id}``."""

    message: str
