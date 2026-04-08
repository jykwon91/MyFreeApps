from platform_shared.core.audit import (
    current_user_id,
    register_audit_listeners as _register,
)

from app.models.system.audit_log import AuditLog

SENSITIVE_FIELDS = {"hashed_password", "access_token", "refresh_token", "issuer_ein"}
SKIP_FIELDS = {"file_content"}
SKIP_TABLES = {"audit_logs", "processed_emails", "usage_logs", "sync_logs"}


def register_audit_listeners() -> None:
    _register(
        audit_log_model=AuditLog,
        skip_tables=SKIP_TABLES,
        sensitive_fields=SENSITIVE_FIELDS,
        skip_fields=SKIP_FIELDS,
    )
