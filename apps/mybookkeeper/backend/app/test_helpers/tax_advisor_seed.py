"""Test-only tax advisor helper: store a known set of advisor suggestions for a
return without calling Claude.

Generating advice needs an Anthropic key, which the E2E stack doesn't have, so
nothing else can give a return suggestions to read, dismiss or resolve. Saves
through ``tax_advisor_persistence.save_advice``, the same path generation uses.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.repositories.tax import tax_return_repo
from app.schemas.tax.tax_advisor import TaxSuggestion
from app.services.tax.tax_advisor_persistence import save_advice
from app.test_helpers.auth import _require_test_mode

router = APIRouter()

SEEDED_MODEL_VERSION = "e2e-seed"


class _SeedAdvisorRequest(BaseModel):
    model_config = {"extra": "forbid"}

    suggestions: list[TaxSuggestion] = Field(min_length=1)


class _SeededAdvisor(BaseModel):
    generation_id: uuid.UUID
    suggestion_ids: list[uuid.UUID]


@router.post("/test/tax-returns/{return_id}/seed-advisor", status_code=201)
async def seed_advisor(
    return_id: uuid.UUID,
    payload: _SeedAdvisorRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeededAdvisor:
    """Replace the active advisor suggestions of a return in my organization."""
    _require_test_mode()
    async with unit_of_work() as db:
        if await tax_return_repo.get_by_id(db, return_id, ctx.organization_id) is None:
            raise HTTPException(status_code=404, detail="Tax return not found")
        generation, suggestions = await save_advice(
            db,
            organization_id=ctx.organization_id,
            tax_return_id=return_id,
            user_id=ctx.user_id,
            suggestions=payload.suggestions,
            model_version=SEEDED_MODEL_VERSION,
        )
        return _SeededAdvisor(generation_id=generation.id, suggestion_ids=[s.id for s in suggestions])
