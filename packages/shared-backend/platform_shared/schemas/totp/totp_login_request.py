from pydantic import BaseModel, Field


class TotpLoginRequest(BaseModel):
    email: str
    password: str
    totp_code: str | None = Field(default=None, min_length=6, max_length=8)
