from contextvars import ContextVar
from datetime import datetime, timezone
from sqlalchemy import event, inspect
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import NO_VALUE
from sqlalchemy.orm.base import NEVER_SET

from app.models.system.audit_log import AuditLog

current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)

SENSITIVE_FIELDS = {"hashed_password", "access_token", "refresh_token", "issuer_ein"}
SKIP_FIELDS = {"file_content"}  # large binary fields with no audit value
SKIP_TABLES = {"audit_logs", "auth_events", "processed_emails", "usage_logs", "sync_logs"}


def _get_record_id(target) -> str:
    pk = inspect(target.__class__).primary_key
    return ",".join(str(getattr(target, col.name, "")) for col in pk)


def _serialize(value) -> str | None:
    return None if value is None else str(value)


def _create_log(session, table_name, record_id, operation, field_name, old_value, new_value):
    session.add(AuditLog(
        table_name=table_name,
        record_id=record_id,
        operation=operation,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        changed_by=current_user_id.get(),
    ))


def _is_loaded(attr) -> bool:
    """Return False for deferred/expired attributes to avoid triggering a lazy load."""
    return attr.loaded_value not in (NEVER_SET, NO_VALUE)


def _handle_insert(session, target):
    if target.__tablename__ in SKIP_TABLES:
        return
    record_id = _get_record_id(target)
    for attr in inspect(target).attrs:
        if attr.key in SKIP_FIELDS or not _is_loaded(attr):
            continue
        new_val = "***" if attr.key in SENSITIVE_FIELDS else _serialize(attr.value)
        _create_log(session, target.__tablename__, record_id, "INSERT", attr.key, None, new_val)


def _handle_update(session, target):
    if target.__tablename__ in SKIP_TABLES:
        return
    record_id = _get_record_id(target)
    for attr in inspect(target).attrs:
        if attr.key in SKIP_FIELDS:
            continue
        hist = attr.history
        if not hist.has_changes():
            continue
        old = hist.deleted[0] if hist.deleted else None
        new = hist.added[0] if hist.added else None
        if attr.key in SENSITIVE_FIELDS:
            old_val = "***" if old is not None else None
            new_val = "***" if new is not None else None
        else:
            old_val, new_val = _serialize(old), _serialize(new)
        _create_log(session, target.__tablename__, record_id, "UPDATE", attr.key, old_val, new_val)


def _handle_delete(session, target):
    if target.__tablename__ in SKIP_TABLES:
        return
    record_id = _get_record_id(target)
    for attr in inspect(target).attrs:
        if attr.key in SKIP_FIELDS or not _is_loaded(attr):
            continue
        old_val = "***" if attr.key in SENSITIVE_FIELDS else _serialize(attr.value)
        _create_log(session, target.__tablename__, record_id, "DELETE", attr.key, old_val, None)


def register_audit_listeners():
    @event.listens_for(Session, "after_flush")
    def after_flush(session, flush_context):
        for target in list(session.new):
            _handle_insert(session, target)
        for target in list(session.dirty):
            _handle_update(session, target)
        for target in list(session.deleted):
            _handle_delete(session, target)
