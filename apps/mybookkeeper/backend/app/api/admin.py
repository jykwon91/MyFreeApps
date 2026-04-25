import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import current_admin
from app.db.session import get_db
from app.models.user.user import User
from app.repositories.system import auth_event_repo
from app.schemas.system.admin import AdminOrgRead, CleanReExtractRequest, CleanReExtractResponse, PlatformStats
from app.schemas.system.auth_event import AuthEventRead
from app.schemas.user.user import AdminUserRoleUpdate, UserRead
from app.services.system import admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserRead])
async def list_users(
    user: User = Depends(current_admin),
) -> list[User]:
    return await admin_service.list_users()


@router.patch("/users/{user_id}/role", response_model=UserRead)
async def update_user_role(
    user_id: uuid.UUID,
    body: AdminUserRoleUpdate,
    admin: User = Depends(current_admin),
) -> User:
    try:
        return await admin_service.update_user_role(user_id, body.role, admin)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/users/{user_id}/deactivate", response_model=UserRead)
async def deactivate_user(
    user_id: uuid.UUID,
    admin: User = Depends(current_admin),
) -> User:
    try:
        return await admin_service.deactivate_user(user_id, admin)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/users/{user_id}/activate", response_model=UserRead)
async def activate_user(
    user_id: uuid.UUID,
    admin: User = Depends(current_admin),
) -> User:
    try:
        return await admin_service.activate_user(user_id, admin)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/stats", response_model=PlatformStats)
async def get_platform_stats(
    user: User = Depends(current_admin),
) -> PlatformStats:
    return await admin_service.get_platform_stats()


@router.patch("/users/{user_id}/superuser", response_model=UserRead)
async def toggle_superuser(
    user_id: uuid.UUID,
    admin: User = Depends(current_admin),
) -> User:
    try:
        return await admin_service.toggle_superuser(user_id, admin)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/clean-re-extract", response_model=CleanReExtractResponse)
async def clean_re_extract(
    body: CleanReExtractRequest,
    admin: User = Depends(current_admin),
) -> CleanReExtractResponse:
    return await admin_service.clean_re_extract(
        organization_id=body.organization_id,
        document_type=body.document_type,
        tax_year=body.tax_year,
        admin=admin,
    )


@router.get("/orgs", response_model=list[AdminOrgRead])
async def list_all_orgs(
    user: User = Depends(current_admin),
) -> list[AdminOrgRead]:
    return await admin_service.list_all_orgs()


@router.get("/auth-events", response_model=list[AuthEventRead])
async def list_auth_events(
    user_id: Optional[uuid.UUID] = None,
    event_type: Optional[str] = None,
    since: Optional[datetime] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    admin: User = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[AuthEventRead]:
    """List auth events. Superuser-only endpoint for security incident review."""
    events = await auth_event_repo.list_filtered(
        db,
        user_id=user_id,
        event_type=event_type,
        since=since,
        limit=limit,
        offset=offset,
    )
    return list(events)
