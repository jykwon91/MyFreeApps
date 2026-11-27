import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.payee_rule_constants import RULE_NOT_FOUND
from app.core.permissions import current_org_member, require_org_role
from app.models.organization.organization_member import OrgRole
from app.schemas.classification.classification_rule import (
    ClassificationRuleCreate,
    ClassificationRuleRead,
)
from app.schemas.classification.rule_applied_to_past import RuleAppliedToPast
from app.schemas.classification.rule_past_matches import RulePastMatches
from app.services.classification import rule_service
from app.services.classification.payee_rule_error import PayeeRuleError
from app.services.transactions.foreign_reference_error import ForeignReferenceError

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
    try:
        return await rule_service.create_rule(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            data=data.model_dump(),
        )
    except ForeignReferenceError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.delete("/{rule_id}", status_code=204)
async def delete_classification_rule(
    rule_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> None:
    deleted = await rule_service.delete_rule(rule_id, ctx.organization_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=RULE_NOT_FOUND)


@router.get("/{rule_id}/past-matches", response_model=RulePastMatches)
async def count_past_matches(
    rule_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> RulePastMatches:
    try:
        count = await rule_service.count_past_matches(rule_id, ctx.organization_id)
    except PayeeRuleError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if count is None:
        raise HTTPException(status_code=404, detail=RULE_NOT_FOUND)
    return RulePastMatches(count=count)


@router.post("/{rule_id}/apply-to-past", response_model=RuleAppliedToPast)
async def apply_rule_to_past(
    rule_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> RuleAppliedToPast:
    try:
        applied = await rule_service.apply_to_past(rule_id, ctx.organization_id)
    except PayeeRuleError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if applied is None:
        raise HTTPException(status_code=404, detail=RULE_NOT_FOUND)
    return RuleAppliedToPast(applied=applied)
