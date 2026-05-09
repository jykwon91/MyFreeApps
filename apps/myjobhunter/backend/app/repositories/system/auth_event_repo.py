"""Auth-event read repository — re-exports the shared ``list_filtered``.

Writes go through ``platform_shared.services.auth_event_service.log_auth_event``.
Reads (used by the admin auth-events listing route) go through
``platform_shared.repositories.auth_event_repo.list_filtered`` —
re-exported here so existing MJH call sites importing from
``app.repositories.system.auth_event_repo`` keep working unchanged.
"""
from platform_shared.repositories.auth_event_repo import list_filtered  # noqa: F401
