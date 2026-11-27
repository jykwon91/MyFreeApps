"""An account the person has: its name, bank and type, never its number."""
from pydantic import BaseModel


class SavingsAccountSummary(BaseModel):
    name: str
    institution: str | None
    account_type: str
    is_closed: bool
