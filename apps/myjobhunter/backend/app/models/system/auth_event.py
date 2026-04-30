"""Thin re-export of the shared AuthEvent model.

The implementation lives in ``platform_shared.db.models.auth_event``. Existing
MyJobHunter call sites (services, repositories, tests) keep importing from
``app.models.system.auth_event`` — they reach the same class either way.
"""
from platform_shared.db.models.auth_event import AuthEvent  # noqa: F401
