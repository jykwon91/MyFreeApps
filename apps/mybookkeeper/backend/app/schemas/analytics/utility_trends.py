import uuid

from pydantic import BaseModel


class UtilityTrendPoint(BaseModel):
    period: str
    property_id: uuid.UUID | None
    property_name: str | None
    sub_category: str
    total: float


class UtilityTrendsResponse(BaseModel):
    trends: list[UtilityTrendPoint]
    summary: dict[str, float]
    total_spend: float
