import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_org_role
from app.models.organization.organization_member import OrgRole
from app.schemas.organization.activity import ActivityCreate, ActivityRead, ActivityUpdate
from app.services.organization import activity_service

router = APIRouter(prefix="/activities", tags=["activities"])


@router.get("", response_model=list[ActivityRead])
async def list_activities(
    ctx: RequestContext = Depends(current_org_member),
) -> list[ActivityRead]:
    activities = await activity_service.list_activities(ctx)
    return [ActivityRead.model_validate(a) for a in activities]


@router.post("", response_model=ActivityRead, status_code=201)
async def create_activity(
    body: ActivityCreate,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> ActivityRead:
    activity = await activity_service.create_activity(
        ctx,
        label=body.label,
        activity_type=body.activity_type,
        tax_form=body.tax_form,
        property_id=body.property_id,
    )
    return ActivityRead.model_validate(activity)


@router.patch("/{activity_id}", response_model=ActivityRead)
async def update_activity(
    activity_id: uuid.UUID,
    body: ActivityUpdate,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> ActivityRead:
    try:
        result = await activity_service.update_activity(
            ctx, activity_id, body.model_dump(exclude_unset=True),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Activity not found")
    return ActivityRead.model_validate(result)


@router.delete("/{activity_id}", status_code=204)
async def delete_activity(
    activity_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> None:
    deleted = await activity_service.delete_activity(ctx, activity_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Activity not found")
