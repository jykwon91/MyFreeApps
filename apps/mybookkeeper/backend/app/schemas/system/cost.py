import uuid
from datetime import datetime

from pydantic import BaseModel


class CostSummary(BaseModel):
    today: float
    this_week: float
    this_month: float
    total_tokens_today: int
    extractions_today: int


class UserCost(BaseModel):
    user_id: uuid.UUID
    email: str
    cost: float
    tokens: int
    extractions: int


class DailyCost(BaseModel):
    date: str
    cost: float
    input_cost: float
    output_cost: float
    tokens: int
    extractions: int


class CostThresholds(BaseModel):
    daily_budget: float
    monthly_budget: float
    per_user_daily_alert: float
    input_rate_per_million: float
    output_rate_per_million: float



class CostThresholdsUpdate(BaseModel):
    daily_budget: float | None = None
    monthly_budget: float | None = None
    per_user_daily_alert: float | None = None
    input_rate_per_million: float | None = None
    output_rate_per_million: float | None = None


class CostAlert(BaseModel):
    id: uuid.UUID
    severity: str
    message: str
    event_data: dict | None = None
    created_at: datetime
