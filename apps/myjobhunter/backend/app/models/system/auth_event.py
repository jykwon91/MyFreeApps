"""Thin re-export of the shared AuthEvent model.

The implementation lives in ``platform_shared.db.models.auth_event``.
MyJobHunter call sites can import from
``app.models.system.auth_event`` and reach the same class.
"""
from platform_shared.db.models.auth_event import AuthEvent  # noqa: F401
