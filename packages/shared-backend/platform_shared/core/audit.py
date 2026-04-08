"""SQLAlchemy audit logging via event listeners.

Usage:
    register_audit_listeners(
        audit_log_model=AuditLog,
        skip_tables={"audit_logs", "usage_logs"},
        sensitive_fields={"hashed_password", "access_token"},
        skip_fields={"file_content"},
    )
"""
from contextvars import ContextVar
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import NO_VALUE
from sqlalchemy.orm.base import NEVER_SET

current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)


def _get_record_id(target: Any) -> str:
    pk = inspect(target.__class__).primary_key
    return ",".join(str(getattr(target, col.name, "")) for col in pk)


def _serialize(value: Any) -> str | None:
    return None if value is None else str(value)


def _is_loaded(attr: Any) -> bool:
    return attr.loaded_value not in (NEVER_SET, NO_VALUE)


def register_audit_listeners(
    *,
    audit_log_model: type,
    skip_tables: set[str] | None = None,
    sensitive_fields: set[str] | None = None,
    skip_fields: set[str] | None = None,
) -> None:
    """Register SQLAlchemy after_flush listeners for audit logging.

    Args:
        audit_log_model: The ORM model class for audit logs. Must accept kwargs:
            table_name, record_id, operation, field_name, old_value, new_value, changed_by
        skip_tables: Table names to exclude from auditing.
        sensitive_fields: Field names to mask with "***".
        skip_fields: Field names to skip entirely (e.g., large binary fields).
    """
    _skip_tables = skip_tables or set()
    _sensitive = sensitive_fields or set()
    _skip_fields = skip_fields or set()

    def _create_log(session: Session, table_name: str, record_id: str,
                    operation: str, field_name: str, old_value: str | None, new_value: str | None) -> None:
        session.add(audit_log_model(
            table_name=table_name,
            record_id=record_id,
            operation=operation,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            changed_by=current_user_id.get(),
        ))

    def _handle_insert(session: Session, target: Any) -> None:
        if target.__tablename__ in _skip_tables:
            return
        record_id = _get_record_id(target)
        for attr in inspect(target).attrs:
            if attr.key in _skip_fields or not _is_loaded(attr):
                continue
            new_val = "***" if attr.key in _sensitive else _serialize(attr.value)
            _create_log(session, target.__tablename__, record_id, "INSERT", attr.key, None, new_val)

    def _handle_update(session: Session, target: Any) -> None:
        if target.__tablename__ in _skip_tables:
            return
        record_id = _get_record_id(target)
        for attr in inspect(target).attrs:
            if attr.key in _skip_fields:
                continue
            hist = attr.history
            if not hist.has_changes():
                continue
            old = hist.deleted[0] if hist.deleted else None
            new = hist.added[0] if hist.added else None
            if attr.key in _sensitive:
                old_val = "***" if old is not None else None
                new_val = "***" if new is not None else None
            else:
                old_val, new_val = _serialize(old), _serialize(new)
            _create_log(session, target.__tablename__, record_id, "UPDATE", attr.key, old_val, new_val)

    def _handle_delete(session: Session, target: Any) -> None:
        if target.__tablename__ in _skip_tables:
            return
        record_id = _get_record_id(target)
        for attr in inspect(target).attrs:
            if attr.key in _skip_fields or not _is_loaded(attr):
                continue
            old_val = "***" if attr.key in _sensitive else _serialize(attr.value)
            _create_log(session, target.__tablename__, record_id, "DELETE", attr.key, old_val, None)

    @event.listens_for(Session, "after_flush")
    def after_flush(session: Session, flush_context: Any) -> None:
        for target in list(session.new):
            _handle_insert(session, target)
        for target in list(session.dirty):
            _handle_update(session, target)
        for target in list(session.deleted):
            _handle_delete(session, target)
