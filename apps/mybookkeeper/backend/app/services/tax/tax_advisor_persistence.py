"""Stores one round of tax advisor suggestions for a return, replacing its active ones."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.mappers import tax_advisor_mapper
from app.models.tax.tax_advisor_generation import TaxAdvisorGeneration
from app.models.tax.tax_advisor_suggestion import TaxAdvisorSuggestion
from app.repositories.tax import tax_advisor_repo
from app.schemas.tax.tax_advisor import TaxSuggestion


async def save_advice(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    tax_return_id: uuid.UUID,
    user_id: uuid.UUID,
    suggestions: list[TaxSuggestion],
    model_version: str,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> tuple[TaxAdvisorGeneration, list[TaxAdvisorSuggestion]]:
    await tax_advisor_repo.delete_active_for_return(db, tax_return_id)

    generation = TaxAdvisorGeneration(
        id=uuid.uuid4(),
        tax_return_id=tax_return_id,
        organization_id=organization_id,
        requested_by=user_id,
        model_version=model_version,
        suggestion_count=len(suggestions),
        raw_response={"suggestions": [s.model_dump() for s in suggestions]},
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    suggestion_models = [
        tax_advisor_mapper.to_suggestion_model(
            s, tax_return_id=tax_return_id, organization_id=organization_id, generation_id=generation.id,
        )
        for s in suggestions
    ]
    saved = await tax_advisor_repo.create_generation_with_suggestions(db, generation, suggestion_models)
    return saved, suggestion_models
