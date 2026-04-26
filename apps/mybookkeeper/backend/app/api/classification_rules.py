import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_org_role
from app.models.organization.organization_member import OrgRole
from app.schemas.classification.classification_rule import (
    ClassificationRuleCreate,
    ClassificationRuleRead,
)
from app.services.classification import rule_service

router = APIRouter(prefix="/classification-rules", tags=["classification-rules"])


@router.get("", response_model=list[ClassificationRuleRead])
async def list_classification_rules(
    match_type: str | None = None,
    ctx: RequestContext = Depends(current_org_member),
) -> list[ClassificationRuleRead]:
    return await rule_service.list_rules(ctx.organization_id, match_type)


@router.post("", response_model=ClassificationRuleRead, status_code=201)
async def create_classification_rule(
    data: ClassificationRuleCreate,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
):
    return await rule_service.create_rule(
        organization_id=ctx.organization_id,
        user_id=ctx.user_id,
        data=data.model_dump(),
    )


@router.delete("/{rule_id}", status_code=204)
async def delete_classification_rule(
    rule_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> None:
    deleted = await rule_service.delete_rule(rule_id, ctx.organization_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Classification rule not found")
