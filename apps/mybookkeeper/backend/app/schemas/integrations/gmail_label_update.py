from pydantic import BaseModel, Field

from app.core.gmail_label_constants import GMAIL_LABEL_MAX_LENGTH


class GmailLabelUpdate(BaseModel):
    """The Gmail label to limit syncing to; blank clears the filter."""

    model_config = {"extra": "forbid"}

    label: str = Field(max_length=GMAIL_LABEL_MAX_LENGTH)
