import uuid

from pydantic import BaseModel


class DiscrepancyItem(BaseModel):
    category: str  # "duplicate" | "1099_gap" | "missing_income" | "orphaned"
    severity: str  # "high" | "medium" | "low"
    title: str
    description: str
    affected_ids: list[str]
    suggested_action: str


class DiscrepancyScanResult(BaseModel):
    tax_return_id: uuid.UUID
    tax_year: int
    scanned_at: str
    items: list[DiscrepancyItem]
    summary: dict[str, int]
