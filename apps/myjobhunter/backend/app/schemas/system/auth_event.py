"""Re-export of the shared ``AuthEventRead`` schema.

Implementation lives in ``platform_shared.schemas.auth_event``. Existing
MJH call sites can import from ``app.schemas.system.auth_event`` and
reach the same class.
"""
from platform_shared.schemas.auth_event import AuthEventRead  # noqa: F401
