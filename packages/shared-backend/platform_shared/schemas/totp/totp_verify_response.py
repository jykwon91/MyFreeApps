from pydantic import BaseModel, Field


class TotpVerifyResponse(BaseModel):
    verified: bool
    recovery_codes: list[str] = Field(default_factory=list)
    # Turning 2FA on ends every earlier token, the caller's too. The client uses this one.
    access_token: str
