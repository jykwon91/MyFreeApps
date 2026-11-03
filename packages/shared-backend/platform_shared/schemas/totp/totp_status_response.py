from pydantic import BaseModel


class TotpStatusResponse(BaseModel):
    enabled: bool
