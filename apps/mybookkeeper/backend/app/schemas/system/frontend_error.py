from pydantic import BaseModel, Field


class FrontendErrorCreate(BaseModel):
    message: str = Field(..., max_length=500)
    stack: str | None = Field(None, max_length=5000)
    url: str | None = Field(None, max_length=2000)
    component: str | None = Field(None, max_length=200)
