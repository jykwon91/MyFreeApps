from pydantic import BaseModel


class TotpLoginResponse(BaseModel):
    detail: str | None = None
    access_token: str | None = None
    token_type: str | None = None
