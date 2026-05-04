import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import current_admin
from app.core.storage import get_storage
from app.db.session import get_db
from app.models.user.user import User
from app.repositories.system import auth_event_repo
from app.schemas.system.admin import AdminOrgRead, CleanReExtractRequest, CleanReExtractResponse, PlatformStats
from app.schemas.system.auth_event import AuthEventRead
from app.schemas.user.user import AdminUserRoleUpdate, UserRead
from app.services.system import admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/storage-health")
async def storage_health(user: User = Depends(current_admin)) -> dict:
    """Diagnostic: report MinIO/storage configuration + reachability.

    Admin-only. Lets ops verify whether presigned-URL signing will work
    without hand-spelunking the VPS .env.
    """
    configured = bool(
        settings.minio_endpoint and settings.minio_access_key and settings.minio_secret_key
    )
    public_endpoint_set = bool(settings.minio_public_endpoint)
    public_differs_from_internal = (
        public_endpoint_set
        and settings.minio_public_endpoint != settings.minio_endpoint
    )
    storage_built = False
    bucket_reachable: bool | None = None
    sign_test: str | None = None
    sign_error: str | None = None
    bucket_error: str | None = None

    if configured:
        try:
            client = get_storage()
            storage_built = client is not None
            if client is not None:
                try:
                    sign_test = client.generate_presigned_url(
                        "_storage-health-probe",
                        expires_in_seconds=60,
                    )
                except Exception as exc:  # noqa: BLE001
                    sign_error = repr(exc)
                try:
                    bucket_reachable = client._client.bucket_exists(
                        settings.minio_bucket,
                    )
                except Exception as exc:  # noqa: BLE001
                    bucket_reachable = False
                    bucket_error = repr(exc)
        except Exception as exc:  # noqa: BLE001
            sign_error = repr(exc)

    return {
        "configured": configured,
        "minio_endpoint_set": bool(settings.minio_endpoint),
        "public_endpoint_set": public_endpoint_set,
        "public_differs_from_internal": public_differs_from_internal,
        "bucket_name": settings.minio_bucket or None,
        "storage_built": storage_built,
        "bucket_reachable": bucket_reachable,
        "sign_test_returned_url": sign_test is not None,
        "sign_error": sign_error,
        "bucket_error": bucket_error,
    }


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
