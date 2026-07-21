from pydantic import BaseModel, ConfigDict, Field


class WelcomeManualUnlockRequest(BaseModel):
    """Body for POST /public/welcome-manuals/{token}/unlock.

    The PIN travels in the body — never the URL or a query string — so it
    never lands in server access logs or browser history.
    """

    # ``max_length`` caps a trivial oversized-payload vector cheaply — the
    # real PIN is ``SHARE_PIN_LENGTH`` (4) digits, and the frontend input
    # already bounds entry at 12. ``hmac.compare_digest`` handles any value
    # safely regardless; this just rejects absurd inputs before the service.
    pin: str = Field(min_length=1, max_length=12)

    model_config = ConfigDict(extra="forbid")
