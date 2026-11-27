"""One category's spending over the summary window, for the research prompt."""
from pydantic import BaseModel


class SavingsCategorySpend(BaseModel):
    # "personal", "rental" or "business".
    scope: str
    category: str
    total_dollars: int
    charges: int
