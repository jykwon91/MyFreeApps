from pydantic import BaseModel, Field


class MobileLoginRequest(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=1024)
    totp_code: str | None = Field(default=None, min_length=6, max_length=8)
    device_name: str | None = Field(default=None, max_length=100)
