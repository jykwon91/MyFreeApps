import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.services.company import company_service

router = APIRouter()


@router.get("/companies")
async def list_companies(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    items = await company_service.list_companies(db, user.id)
    return {"items": [], "total": len(items)}


@router.get("/companies/{company_id}/research")
async def get_company_research(
    company_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    research = await company_service.get_company_research(db, company_id, user.id)
    if research is None:
        raise HTTPException(status_code=404, detail="Research not found")
    return {"research": {"id": str(research.id)}}
