from pydantic import BaseModel


class WelcomeManualShareGateResponse(BaseModel):
    """The public gate-check response — deliberately carries NOTHING beyond
    ``requires_pin``. No title, no content, no metadata leaks before the
    guest has proven they hold the PIN."""

    requires_pin: bool = True
