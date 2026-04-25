import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator


TaxSituation = Literal["rental_property", "self_employment", "w2_employment", "investment"]
FilingStatus = Literal["single", "married_filing_jointly", "married_filing_separately", "head_of_household", "qualifying_surviving_spouse"]

ALLOWED_TAX_SITUATIONS = {"rental_property", "self_employment", "w2_employment", "investment"}


class TaxProfileUpdate(BaseModel):
    tax_situations: list[TaxSituation] | None = None
    dependents_count: int | None = Field(default=None, ge=0, le=20)

    @field_validator("tax_situations")
    @classmethod
    def validate_tax_situations(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            invalid = set(v) - ALLOWED_TAX_SITUATIONS
            if invalid:
                raise ValueError(f"Invalid tax situations: {invalid}")
        return v


class TaxProfileOnboardingComplete(BaseModel):
    tax_situations: list[TaxSituation]
    filing_status: FilingStatus
    dependents_count: int = Field(default=0, ge=0, le=20)

    @field_validator("tax_situations")
    @classmethod
    def validate_tax_situations(cls, v: list[str]) -> list[str]:
        invalid = set(v) - ALLOWED_TAX_SITUATIONS
        if invalid:
            raise ValueError(f"Invalid tax situations: {invalid}")
        return v


class TaxProfileRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    tax_situations: list[str]
    dependents_count: int
    onboarding_completed: bool

    model_config = {"from_attributes": True}
