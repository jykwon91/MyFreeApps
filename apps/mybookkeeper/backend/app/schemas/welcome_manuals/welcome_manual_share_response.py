from pydantic import BaseModel, ConfigDict


class WelcomeManualShareResponse(BaseModel):
    """Owner-only response for the share-link enable/rotate routes.

    ``share_pin`` is the DECRYPTED plaintext PIN so the host can read/copy it
    to re-share with a guest — never returned from any public/unauthenticated
    endpoint.
    """

    share_token: str
    share_path: str
    share_pin: str

    model_config = ConfigDict(from_attributes=True)
