from pydantic import BaseModel, Field


class TotpSetupRequest(BaseModel):
    password: str = Field(min_length=1)
