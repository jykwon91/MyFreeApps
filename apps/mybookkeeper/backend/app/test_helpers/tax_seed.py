"""Test-only tax seed, so E2E tests can give a return a form without extracting a document.

Lives beside ``seed.py`` rather than inside it: that module is past the
500-LOC guard.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.repositories.tax import tax_return_repo
from app.test_helpers.auth import _require_test_mode

router = APIRouter()


class _SeedFormInstanceRequest(BaseModel):
    model_config = {"extra": "forbid"}

    form_name: str = Field(min_length=1, max_length=50)
    instance_label: str | None = Field(default=None, max_length=255)


class _SeededFormInstance(BaseModel):
    id: uuid.UUID


@router.post("/test/tax-returns/{return_id}/seed-form-instance", status_code=201)
async def seed_form_instance(
    return_id: uuid.UUID,
    payload: _SeedFormInstanceRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeededFormInstance:
    """Add a manual, field-less instance of one form to a return in my organization."""
    _require_test_mode()
    async with unit_of_work() as db:
        tax_return = await tax_return_repo.get_by_id(db, return_id, ctx.organization_id)
        if tax_return is None:
            raise HTTPException(status_code=404, detail="Tax return not found")
        instance = await tax_return_repo.upsert_form_instance(
            db, return_id, payload.form_name, "manual", instance_label=payload.instance_label,
        )
        return _SeededFormInstance(id=instance.id)
