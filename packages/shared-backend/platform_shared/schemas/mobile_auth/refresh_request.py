from pydantic import BaseModel, Field


class RefreshRequest(BaseModel):
    refresh_token: str = Field(max_length=300)
