from pydantic import BaseModel, Field

from app.core.gmail_connect_constants import GMAIL_CONNECT_CODE_MAX_LENGTH, GMAIL_CONNECT_STATE_MAX_LENGTH


class GmailConnectComplete(BaseModel):
    """Google's code and the signed state, handed back by the app that started the connection."""

    model_config = {"extra": "forbid"}

    code: str = Field(min_length=1, max_length=GMAIL_CONNECT_CODE_MAX_LENGTH)
    state: str = Field(min_length=1, max_length=GMAIL_CONNECT_STATE_MAX_LENGTH)
