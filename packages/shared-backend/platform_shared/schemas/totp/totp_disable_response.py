from pydantic import BaseModel


class TotpDisableResponse(BaseModel):
    disabled: bool
    # Turning 2FA off ends every earlier token, the caller's too. The client uses this one.
    access_token: str
