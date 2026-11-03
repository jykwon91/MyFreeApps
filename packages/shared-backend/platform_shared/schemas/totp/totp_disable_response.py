from pydantic import BaseModel


class TotpDisableResponse(BaseModel):
    disabled: bool
