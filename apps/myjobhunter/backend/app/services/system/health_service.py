"""Health-probe service — database connectivity check."""
from app.db.session import AsyncSessionLocal
from app.repositories.system import health_repository


async def check_database() -> bool:
    """Return True when a trivial query round-trips, False on any failure."""
    try:
        async with AsyncSessionLocal() as db:
            await health_repository.ping(db)
        return True
    except Exception:
        return False
