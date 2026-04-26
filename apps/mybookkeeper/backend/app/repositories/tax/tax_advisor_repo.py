import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.tax.tax_advisor_generation import TaxAdvisorGeneration
from app.models.tax.tax_advisor_suggestion import TaxAdvisorSuggestion


async def get_latest_generation(
    db: AsyncSession,
    tax_return_id: uuid.UUID,
) -> TaxAdvisorGeneration | None:
    result = await db.execute(
        select(TaxAdvisorGeneration)
        .where(TaxAdvisorGeneration.tax_return_id == tax_return_id)
        .order_by(TaxAdvisorGeneration.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_active_for_return(
    db: AsyncSession,
    tax_return_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> Sequence[TaxAdvisorSuggestion]:
    """Return all suggestions where status != 'dismissed' for the latest generation,
    plus any dismissed/resolved from older generations."""
    latest_gen = await get_latest_generation(db, tax_return_id)
    if not latest_gen:
        return []

    result = await db.execute(
        select(TaxAdvisorSuggestion)
        .where(
            TaxAdvisorSuggestion.tax_return_id == tax_return_id,
            TaxAdvisorSuggestion.organization_id == organization_id,
        )
        .where(
            # All non-dismissed from latest generation, OR dismissed/resolved from any older generation
            (
                (TaxAdvisorSuggestion.generation_id == latest_gen.id)
                & (TaxAdvisorSuggestion.status != "dismissed")
            )
            | (
                (TaxAdvisorSuggestion.generation_id != latest_gen.id)
                & (TaxAdvisorSuggestion.status.in_(["dismissed", "resolved"]))
            )
        )
        .order_by(TaxAdvisorSuggestion.created_at)
    )
    return result.scalars().all()


async def create_generation_with_suggestions(
    db: AsyncSession,
    generation: TaxAdvisorGeneration,
    suggestions: list[TaxAdvisorSuggestion],
) -> TaxAdvisorGeneration:
    db.add(generation)
    await db.flush()
    for suggestion in suggestions:
        suggestion.generation_id = generation.id
        db.add(suggestion)
    await db.flush()
    return generation


async def delete_active_for_return(
    db: AsyncSession,
    tax_return_id: uuid.UUID,
) -> None:
    await db.execute(
        delete(TaxAdvisorSuggestion).where(
            TaxAdvisorSuggestion.tax_return_id == tax_return_id,
            TaxAdvisorSuggestion.status == "active",
        )
    )


async def update_suggestion_status(
    db: AsyncSession,
    suggestion_id: uuid.UUID,
    organization_id: uuid.UUID,
    status: str,
    user_id: uuid.UUID,
) -> TaxAdvisorSuggestion | None:
    result = await db.execute(
        select(TaxAdvisorSuggestion).where(
            TaxAdvisorSuggestion.id == suggestion_id,
            TaxAdvisorSuggestion.organization_id == organization_id,
        )
    )
    suggestion = result.scalar_one_or_none()
    if not suggestion:
        return None

    suggestion.status = status
    suggestion.status_changed_at = datetime.now(timezone.utc)
    suggestion.status_changed_by = user_id
    await db.flush()
    return suggestion


async def get_latest_generation_with_suggestions(
    db: AsyncSession,
    tax_return_id: uuid.UUID,
) -> TaxAdvisorGeneration | None:
    result = await db.execute(
        select(TaxAdvisorGeneration)
        .where(TaxAdvisorGeneration.tax_return_id == tax_return_id)
        .options(selectinload(TaxAdvisorGeneration.suggestions))
        .order_by(TaxAdvisorGeneration.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
