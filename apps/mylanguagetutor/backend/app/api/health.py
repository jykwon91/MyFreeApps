from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db.session import AsyncSessionLocal

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health probe — DB connectivity + deploy version."""
    from app.main import GIT_COMMIT

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected", "version": GIT_COMMIT}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "unreachable", "version": GIT_COMMIT},
        )
