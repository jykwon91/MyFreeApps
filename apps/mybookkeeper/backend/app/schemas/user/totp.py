from pydantic import BaseModel, Field


class TotpSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str


class TotpVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TotpVerifyResponse(BaseModel):
    verified: bool
    recovery_codes: list[str] = []


class TotpDisableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TotpLoginRequest(BaseModel):
    email: str
    password: str
    totp_code: str | None = Field(default=None, min_length=6, max_length=8)


class TotpDisableResponse(BaseModel):
    disabled: bool


class TotpStatusResponse(BaseModel):
    enabled: bool


class TotpLoginResponse(BaseModel):
    detail: str | None = None
    access_token: str | None = None
    token_type: str | None = None
