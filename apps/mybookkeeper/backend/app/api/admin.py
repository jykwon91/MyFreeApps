"""MBK admin endpoints (app-specific only).

Generic admin user-management endpoints (list users, change role,
activate/deactivate, toggle superuser, user-count stats) are mounted
from ``platform_shared.api.admin_router`` in ``app.main``. The auth-events
listing route is mounted from ``platform_shared.api.admin_auth_events_router``
in this file. This module owns only the MBK-specific admin surface area.
"""
from fastapi import APIRouter, Depends

from platform_shared.api.admin_auth_events_router import (
    build_admin_auth_events_router,
)

from app.core.config import settings
from app.core.permissions import current_admin
from app.core.storage import get_storage
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.system.admin import AdminOrgRead, CleanReExtractRequest, CleanReExtractResponse, PlatformStats
from app.services.system import admin_service

router = APIRouter(prefix="/admin", tags=["admin"])
router.include_router(
    build_admin_auth_events_router(
        admin_dependency=current_admin,
        get_db_dependency=get_db,
    ),
)


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


@router.get("/stats", response_model=PlatformStats)
async def get_platform_stats(
    user: User = Depends(current_admin),
) -> PlatformStats:
    """User counts (from shared admin) + MBK-specific org/txn/doc counts."""
    return await admin_service.get_platform_stats()


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
