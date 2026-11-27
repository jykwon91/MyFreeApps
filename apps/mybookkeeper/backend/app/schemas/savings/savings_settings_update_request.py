"""Turn daily savings research on or off."""
from pydantic import BaseModel


class SavingsSettingsUpdateRequest(BaseModel):
    enabled: bool
