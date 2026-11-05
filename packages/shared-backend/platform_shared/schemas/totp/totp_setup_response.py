from pydantic import BaseModel

from platform_shared.services.totp_service import TotpAlgorithm


class TotpSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str
    algorithm: TotpAlgorithm
    digits: int
    period: int
