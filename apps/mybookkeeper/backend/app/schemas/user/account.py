from pydantic import BaseModel, Field


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1)
    confirm_email: str = Field(min_length=1)
    totp_code: str | None = Field(default=None, min_length=6, max_length=8)
