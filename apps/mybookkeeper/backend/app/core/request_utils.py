"""Thin re-export of the shared request introspection helpers.

The implementation lives in ``platform_shared.core.request_utils``. Existing
MyBookkeeper call sites keep importing from ``app.core.request_utils`` — they
reach the same function either way.
"""
from platform_shared.core.request_utils import get_client_ip  # noqa: F401
