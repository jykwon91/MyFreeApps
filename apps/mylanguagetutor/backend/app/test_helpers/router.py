"""Test-helpers router — aggregates generic test sub-routers.

Only mounted when ``settings.app_enable_test_helpers`` is True.
Never mount in production.

Generic helpers ship in the scaffold (rate-limit reset). App-specific seed
endpoints (e.g., domain-fixture seeders) should be added in a sibling module
and included here.
"""
from fastapi import APIRouter

from app.test_helpers import reset

router = APIRouter(prefix="/_test", tags=["test"])
router.include_router(reset.router)
