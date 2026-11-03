from pydantic import BaseModel, Field


class TotpVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
