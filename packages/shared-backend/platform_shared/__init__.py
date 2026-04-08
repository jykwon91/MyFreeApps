"""Shared backend infrastructure for MyFreeApps.

Modules:
    platform_shared.db.base          — DeclarativeBase
    platform_shared.db.session        — create_session_factory()
    platform_shared.core.context      — RequestContext
    platform_shared.core.security     — create_fernet_suite(), create_pii_suite()
    platform_shared.core.storage      — StorageClient, get_storage()
    platform_shared.core.rate_limit   — RateLimiter, get_client_ip()
    platform_shared.core.audit        — register_audit_listeners(), current_user_id
    platform_shared.services.email_service  — EmailService
    platform_shared.services.totp_service   — generate_secret(), verify_code(), etc.
    platform_shared.services.event_service  — create_event_recorder()
"""
