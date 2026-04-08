import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


EventType = Literal[
    "rate_limited", "extraction_failed", "extraction_retried", "extraction_completed",
    "extraction_quality_low", "category_corrected", "property_corrected",
    "rule_applied", "worker_error", "db_connection_error", "api_usage_high", "cost_alert",
]
Severity = Literal["info", "warning", "error", "critical"]
HealthStatus = Literal["healthy", "degraded", "unhealthy"]


class SystemEventRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None = None
    event_type: str
    severity: str
    message: str
    event_data: dict | None = None
    resolved: bool
    resolved_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActiveProblem(BaseModel):
    type: str
    count: int
    severity: str
    message: str


class HealthStats(BaseModel):
    documents_processing: int
    documents_failed: int
    documents_retry_pending: int
    extractions_today: int
    corrections_today: int
    api_tokens_today: int


class HealthSummary(BaseModel):
    status: HealthStatus
    active_problems: list[ActiveProblem]
    stats: HealthStats
    recent_events: list[SystemEventRead]


class ResolveEventResponse(BaseModel):
    resolved: bool


class RetryFailedResponse(BaseModel):
    retried: int
