import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WelcomeManualSendResponse(BaseModel):
    """Send-log record returned to the HOST after a send attempt.

    Returning ``recipient_email``/``recipient_name`` is NOT cross-tenant
    leakage — the host owns the manual and just typed these values. ``status``
    communicates the outcome (sent / failed / skipped) so the frontend can
    render a clear success or couldn't-send message; ``error_reason`` is a
    short diagnostic for failed/skipped attempts.
    """

    id: uuid.UUID
    manual_id: uuid.UUID
    recipient_email: str
    recipient_name: str | None = None
    status: str
    error_reason: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
