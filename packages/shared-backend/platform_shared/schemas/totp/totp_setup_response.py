from pydantic import BaseModel


class TotpSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str
