"""A property, located only to its city, state and ZIP (for tax and insurance research)."""
from pydantic import BaseModel


class SavingsPropertySummary(BaseModel):
    # "Property 1", "Property 2": a property's name is usually its street address.
    label: str
    classification: str
    location: str | None
    estimated_value_dollars: int | None
