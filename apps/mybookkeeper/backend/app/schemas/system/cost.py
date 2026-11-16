import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, model_validator


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
    """Bounds match the platform_settings columns: budgets Numeric(10,2), rates Numeric(10,4), all NOT NULL."""

    daily_budget: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2, allow_inf_nan=False)
    monthly_budget: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2, allow_inf_nan=False)
    per_user_daily_alert: Decimal | None = Field(
        default=None, ge=0, max_digits=10, decimal_places=2, allow_inf_nan=False,
    )
    input_rate_per_million: Decimal | None = Field(
        default=None, ge=0, max_digits=10, decimal_places=4, allow_inf_nan=False,
    )
    output_rate_per_million: Decimal | None = Field(
        default=None, ge=0, max_digits=10, decimal_places=4, allow_inf_nan=False,
    )

    @model_validator(mode="before")
    @classmethod
    def _refuse_explicit_null(cls, data: Any) -> Any:
        if isinstance(data, dict):
            nulls = sorted(key for key, value in data.items() if value is None)
            if nulls:
                raise ValueError(f"{', '.join(nulls)} can't be empty; leave a field out to keep its value.")
        return data


class CostAlert(BaseModel):
    id: uuid.UUID
    severity: str
    message: str
    event_data: dict | None = None
    created_at: datetime
