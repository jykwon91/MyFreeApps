from pydantic import BaseModel, Field


class TotpLoginRequest(BaseModel):
    email: str = Field(max_length=320)
    password: str
    totp_code: str | None = Field(default=None, min_length=6, max_length=8)
