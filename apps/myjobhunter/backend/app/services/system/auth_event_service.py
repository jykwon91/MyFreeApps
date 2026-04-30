"""Thin re-export of the shared auth-event write helper.

The implementation lives in
``platform_shared.services.auth_event_service``. MyJobHunter call sites
keep importing ``log_auth_event`` from
``app.services.system.auth_event_service`` — they reach the same function
either way.
"""
from platform_shared.services.auth_event_service import log_auth_event  # noqa: F401
