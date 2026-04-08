"""Demo user management endpoints - admin-only CRUD."""

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.permissions import current_admin
from app.models.user.user import User
from app.schemas.demo.demo import (
    DemoCreateRequest,
    DemoCreateResponse,
    DemoDeleteResponse,
    DemoResetResponse,
    DemoUserListResponse,
)
from app.services.demo import demo_service

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/create", response_model=DemoCreateResponse)
async def create_demo(
    body: DemoCreateRequest,
    admin: User = Depends(current_admin),
) -> DemoCreateResponse:
    try:
        return await demo_service.create_demo_user(
            tag=body.tag,
            recipient_email=body.recipient_email,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/users", response_model=DemoUserListResponse)
async def list_demo_users(
    admin: User = Depends(current_admin),
) -> DemoUserListResponse:
    return await demo_service.list_demo_users()


@router.delete("/users/{user_id}", response_model=DemoDeleteResponse)
async def delete_demo_user(
    user_id: uuid.UUID,
    admin: User = Depends(current_admin),
) -> DemoDeleteResponse:
    try:
        return await demo_service.delete_demo_user(user_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reset/{user_id}", response_model=DemoResetResponse)
async def reset_demo_user(
    user_id: uuid.UUID,
    admin: User = Depends(current_admin),
) -> DemoResetResponse:
    try:
        return await demo_service.reset_demo_user(user_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
