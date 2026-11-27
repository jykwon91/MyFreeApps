"""An idea an earlier run already found, so this run reuses its subject when it finds it again."""
from pydantic import BaseModel


class SavingsKnownIdea(BaseModel):
    category: str
    subject: str
    title: str
    status: str
