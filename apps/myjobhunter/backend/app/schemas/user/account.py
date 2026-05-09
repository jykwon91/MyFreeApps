"""Re-export of the shared ``DeleteAccountRequest`` schema.

Implementation lives in ``platform_shared.schemas.account``. Existing
MJH call sites (route handler, tests) import from
``app.schemas.user.account`` and reach the same class.
"""
from platform_shared.schemas.account import DeleteAccountRequest  # noqa: F401
