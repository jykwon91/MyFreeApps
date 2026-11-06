"""How many submissions mark-triaged actually changed."""
from pydantic import BaseModel


class TriageMarkTriagedResult(BaseModel):
    marked: int
