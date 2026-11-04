"""What ``POST /applicants/{id}/sensitive`` returns."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.applicants.reference_contact_response import ReferenceContactResponse
from app.schemas.applicants.screening_report_response import ScreeningReportResponse


class ApplicantSensitiveResponse(BaseModel):
    dob: str | None = None
    vehicle_make_model: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    references: list[ReferenceContactResponse] = []
    screening_reports: list[ScreeningReportResponse] = []

    model_config = ConfigDict(from_attributes=True)
