"""Thin re-export of the shared auth-event write helper.

The implementation lives in ``platform_shared.services.auth_event_service``.
MJH call sites import ``log_auth_event`` from
``app.services.system.auth_event_service`` so we have a stable seam if we
ever need to layer MJH-specific behaviour (e.g. masking extra metadata
fields) on top.
"""
from platform_shared.services.auth_event_service import log_auth_event  # noqa: F401
