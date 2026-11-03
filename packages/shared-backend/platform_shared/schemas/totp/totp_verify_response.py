from pydantic import BaseModel, Field


class TotpVerifyResponse(BaseModel):
    verified: bool
    recovery_codes: list[str] = Field(default_factory=list)
