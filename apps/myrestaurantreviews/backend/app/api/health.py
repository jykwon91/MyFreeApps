from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import AsyncSessionLocal

router = APIRouter()


@router.get("/health")
async def health_check():
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}
