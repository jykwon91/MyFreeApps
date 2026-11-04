import uuid

from pydantic import BaseModel


class MobileLoginResponse(BaseModel):
    """Either ``detail="totp_required"``, or a signed-in session."""

    detail: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str | None = None
    expires_in: int | None = None
    session_id: uuid.UUID | None = None
