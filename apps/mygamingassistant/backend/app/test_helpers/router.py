"""MGA test-helpers router — aggregates seed + reset sub-routers.

Only mounted when ``settings.mga_enable_test_helpers`` is True. Never mount
in production.

Auth policy for test helpers:
  - ``reset-rate-limit`` is intentionally unauthenticated — E2E tests need
    to clear login throttling buckets BEFORE they can log in. Adding auth
    would create a chicken-and-egg problem if the throttle has fired.
  - ``seed-lineup`` and ``delete-seeded-lineup`` ARE auth-gated at the handler
    level (``current_active_user``) because they create / destroy real DB rows.

The env gate (``MGA_ENABLE_TEST_HELPERS=1``) is the primary safety. In production
this flag is never set, so the router never mounts and the routes return 404.

See ``apps/mygamingassistant/CLAUDE.md`` → Authentication Model.
"""
from fastapi import APIRouter

from app.test_helpers import reset, seed

router = APIRouter(prefix="/_test", tags=["test"])
router.include_router(reset.router)
router.include_router(seed.router)
