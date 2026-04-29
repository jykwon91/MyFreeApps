"""Shared backend infrastructure for MyFreeApps.

Modules:
    platform_shared.db.base                  — DeclarativeBase
    platform_shared.db.session               — create_session_factory()
    platform_shared.db.models.audit_log      — AuditLog ORM model
    platform_shared.core.context             — RequestContext
    platform_shared.core.security            — create_fernet_suite(), create_pii_suite(), encrypt_pii(), decrypt_pii()
    platform_shared.core.encrypted_string_type — EncryptedString TypeDecorator, PIICodec
    platform_shared.core.storage             — StorageClient, get_storage()
    platform_shared.core.rate_limit          — RateLimiter, get_client_ip()
    platform_shared.core.audit               — register_audit_listeners(),
                                                register_sensitive_fields(),
                                                register_skip_tables(),
                                                register_skip_fields(),
                                                current_user_id
    platform_shared.core.auth_events         — AuthEventType
    platform_shared.core.auth_messages       — RATE_LIMIT_GENERIC_DETAIL
    platform_shared.services.email_service   — EmailService
    platform_shared.services.totp_service    — generate_secret(), verify_code(), etc.
    platform_shared.services.event_service   — create_event_recorder()
    platform_shared.services.hibp_service    — is_password_pwned(), HIBPCheckError
    platform_shared.services.turnstile_service — verify_turnstile_token()
"""
