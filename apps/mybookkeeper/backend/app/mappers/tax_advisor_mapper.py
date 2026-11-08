"""Converts tax advisor suggestions between the API schema and the ORM model."""
import uuid

from app.models.tax.tax_advisor_suggestion import TaxAdvisorSuggestion
from app.schemas.tax.tax_advisor import TaxAdvisorSuggestionRead, TaxSuggestion


def to_suggestion_model(
    suggestion: TaxSuggestion,
    *,
    tax_return_id: uuid.UUID,
    organization_id: uuid.UUID,
    generation_id: uuid.UUID,
) -> TaxAdvisorSuggestion:
    return TaxAdvisorSuggestion(
        tax_return_id=tax_return_id,
        organization_id=organization_id,
        generation_id=generation_id,
        suggestion_key=suggestion.id,
        category=suggestion.category,
        severity=suggestion.severity,
        title=suggestion.title,
        description=suggestion.description,
        estimated_savings=suggestion.estimated_savings,
        action=suggestion.action,
        irs_reference=suggestion.irs_reference,
        confidence=suggestion.confidence,
        affected_properties=suggestion.affected_properties,
        affected_form=suggestion.affected_form,
        status="active",
    )


def to_suggestion_read(suggestion: TaxAdvisorSuggestion) -> TaxAdvisorSuggestionRead:
    return TaxAdvisorSuggestionRead(
        db_id=suggestion.id,
        status=suggestion.status,
        status_changed_at=suggestion.status_changed_at,
        generation_id=suggestion.generation_id,
        id=suggestion.suggestion_key,
        category=suggestion.category,
        severity=suggestion.severity,
        title=suggestion.title,
        description=suggestion.description,
        estimated_savings=suggestion.estimated_savings,
        action=suggestion.action,
        irs_reference=suggestion.irs_reference,
        confidence=suggestion.confidence,
        affected_properties=suggestion.affected_properties,
        affected_form=suggestion.affected_form,
    )
