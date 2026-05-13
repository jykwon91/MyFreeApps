"""SQLAlchemy audit logging via event listeners.

This module captures INSERT / UPDATE / DELETE events on every flush and writes
per-field rows into the shared ``audit_logs`` table. Each consuming app
contributes its own list of column names that should be masked as ``"***"``
(PII, secrets, tokens) and any additional tables that should be skipped from
auditing entirely.

Usage (in the consuming app's ``main.py`` lifespan or core/audit.py wrapper)::

    from platform_shared.core.audit import (
        register_audit_listeners,
        register_sensitive_fields,
        register_skip_tables,
        register_skip_fields,
    )

    register_sensitive_fields([
        "hashed_password",
        "access_token",
        "inquirer_email",
        # ...all PII / secret column names for this app
    ])
    register_skip_tables(["usage_logs", "auth_events"])
    register_audit_listeners()  # idempotent — safe across reloader restarts

The ``audit_logs`` table itself is skipped by default to prevent recursion.
The listener writes ``changed_by`` from the ``current_user_id`` ContextVar by
default; pass ``get_actor`` to override (e.g. for workers that read from a
different request-context source).
"""
from __future__ import annotations

from collections.abc import Callable, Iterable
from contextvars import ContextVar
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import NO_VALUE
from sqlalchemy.orm.base import NEVER_SET

from platform_shared.db.base import Base
from platform_shared.db.models.audit_log import AuditLog


class AuditConfigurationError(RuntimeError):
    """Raised when the audit registry is misconfigured in a way that would
    silently disable PII masking (e.g. a registered sensitive-field name that
    doesn't match any ORM column on any mapped class).
    """


# Per-request actor identifier for the ``changed_by`` column. Apps' middleware
# is responsible for setting + resetting this on each request.
current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)

# Module-level state — apps populate at import time so the listener never fires
# without the masking sets being correct.
_sensitive_fields: set[str] = set()
_skip_tables: set[str] = {"audit_logs"}  # default: never recurse into ourselves
_skip_fields: set[str] = set()
_listeners_registered: bool = False
# Hold a reference to the SQLAlchemy listener function for ``reset_registry``
# (test-only) to detach. Production code never reads this.
_attached_listener: Any | None = None


def register_sensitive_fields(field_names: Iterable[str]) -> None:
    """Add column names whose values should be masked as ``"***"`` in audit log entries."""
    _sensitive_fields.update(field_names)


def register_skip_tables(table_names: Iterable[str]) -> None:
    """Add table names that the listener should ignore entirely.

    The shared default already includes ``audit_logs`` (recursion guard); apps
    typically add their high-volume / secret-bearing tables here (e.g.
    ``auth_events``, ``usage_logs``, ``processed_emails``, ``sync_logs``).
    """
    _skip_tables.update(table_names)


def register_skip_fields(field_names: Iterable[str]) -> None:
    """Add column names that should be omitted from audit rows entirely.

    Use for large binary blobs (``file_content``) where neither the value nor a
    masked stub is useful and storing per-field rows would bloat the table.
    """
    _skip_fields.update(field_names)


def get_sensitive_fields() -> frozenset[str]:
    """Read-only view of the registered sensitive fields (for assertions / tests)."""
    return frozenset(_sensitive_fields)


def get_skip_tables() -> frozenset[str]:
    """Read-only view of the registered skip-tables (for assertions / tests)."""
    return frozenset(_skip_tables)


def _all_mapped_column_keys() -> set[str]:
    """Collect every SQLAlchemy column attribute key across all mapped tables.

    Returns the union of ``column.key`` for every column on every table
    registered with the shared ``Base.metadata``. Apps must import their model
    modules before calling :func:`register_audit_listeners` so all relevant
    tables are present in metadata at verification time.
    """
    return {col.key for table in Base.metadata.tables.values() for col in table.columns}


def verify_sensitive_field_names() -> None:
    """Raise :class:`AuditConfigurationError` if any registered sensitive-field
    name does not match an actual column attribute on any mapped class.

    The PII mask compares ``attr.key`` (the SQLAlchemy attribute name) against
    ``_sensitive_fields`` on every flush. A name that matches no column means
    the mask silently never fires for that field — exactly the typo class that
    leaked plaintext TOTP secrets into ``audit_logs`` in MJH + MGA before this
    check was added.

    Called automatically by :func:`register_audit_listeners` unless
    ``verify_field_names=False`` is passed (tests that exercise the listener
    against ad-hoc tables may opt out).
    """
    known = _all_mapped_column_keys()
    unknown = _sensitive_fields - known
    if not unknown:
        return
    raise AuditConfigurationError(
        "register_sensitive_fields() received names that don't match any ORM "
        f"column on any mapped class: {sorted(unknown)}. The audit mask will "
        "never fire for these names — plaintext values in the columns they were "
        "meant to mask will leak into audit_logs. Check spelling against the "
        "actual SQLAlchemy attribute names on your models. (Tip: this check "
        "runs against Base.metadata, so make sure every model module is "
        "imported before register_audit_listeners is called — apps' main.py "
        "lifespan already does this via the import side-effect chain.)",
    )


def reset_registry() -> None:
    """Clear all registrations + reset to seed defaults. Test-only.

    Production code must never call this — it removes the masking guarantee for
    every subsequent flush. Also detaches the SQLAlchemy event listener so a
    subsequent ``register_audit_listeners()`` call attaches a fresh one (the
    SQLAlchemy event registry is a process-global, not session-scoped).
    """
    global _listeners_registered, _attached_listener
    _sensitive_fields.clear()
    _skip_fields.clear()
    _skip_tables.clear()
    _skip_tables.add("audit_logs")
    if _attached_listener is not None:
        try:
            event.remove(Session, "after_flush", _attached_listener)
        except Exception:  # pragma: no cover — defensive only; tests never hit it
            pass
        _attached_listener = None
    _listeners_registered = False


def _get_record_id(target: Any) -> str:
    pk = inspect(target.__class__).primary_key
    return ",".join(str(getattr(target, col.name, "")) for col in pk)


def _serialize(value: Any) -> str | None:
    return None if value is None else str(value)


def _is_loaded(attr: Any) -> bool:
    """Return False for deferred / expired attributes to avoid lazy-load on flush."""
    return attr.loaded_value not in (NEVER_SET, NO_VALUE)


def register_audit_listeners(
    *,
    audit_log_model: type = AuditLog,
    get_actor: Callable[[], str | None] | None = None,
    verify_field_names: bool = True,
) -> None:
    """Attach the after_flush listener that writes audit rows.

    Args:
        audit_log_model: ORM class to use for audit rows. Defaults to the shared
            :class:`platform_shared.db.models.audit_log.AuditLog`. Apps that
            need a custom audit table shape can pass their own model — the
            listener constructs it via the same kwargs (``table_name``,
            ``record_id``, ``operation``, ``field_name``, ``old_value``,
            ``new_value``, ``changed_by``).
        get_actor: Callable returning the current actor's user-id string for
            the ``changed_by`` column. Defaults to reading
            :data:`current_user_id`. Pass a different callable when the app
            populates a different request-context store.
        verify_field_names: When True (default), call
            :func:`verify_sensitive_field_names` BEFORE attaching the listener
            so the app fails to boot if any registered sensitive-field name
            doesn't match a real ORM column. Tests that exercise the listener
            against ad-hoc tables not in ``Base.metadata`` can pass False.

    Idempotent — calling more than once (e.g. across uvicorn reloader restarts
    or pytest sessions that reuse the process) is a no-op.

    Raises:
        AuditConfigurationError: when ``verify_field_names`` is True and any
            registered sensitive-field name has zero matches against the
            mapped-column set. Fail-loud is intentional — silently dropping
            the mask is how plaintext leaks happen.
    """
    global _listeners_registered, _attached_listener
    if _listeners_registered:
        return

    if verify_field_names:
        verify_sensitive_field_names()

    actor: Callable[[], str | None] = get_actor or (lambda: current_user_id.get())

    def _create_log(
        session: Session,
        table_name: str,
        record_id: str,
        operation: str,
        field_name: str,
        old_value: str | None,
        new_value: str | None,
    ) -> None:
        session.add(audit_log_model(
            table_name=table_name,
            record_id=record_id,
            operation=operation,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            changed_by=actor(),
        ))

    def _handle_insert(session: Session, target: Any) -> None:
        if target.__tablename__ in _skip_tables:
            return
        record_id = _get_record_id(target)
        for attr in inspect(target).attrs:
            if attr.key in _skip_fields or not _is_loaded(attr):
                continue
            new_val = "***" if attr.key in _sensitive_fields else _serialize(attr.value)
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
            if attr.key in _sensitive_fields:
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
            old_val = "***" if attr.key in _sensitive_fields else _serialize(attr.value)
            _create_log(session, target.__tablename__, record_id, "DELETE", attr.key, old_val, None)

    def _after_flush(session: Session, _flush_context: Any) -> None:
        for target in list(session.new):
            _handle_insert(session, target)
        for target in list(session.dirty):
            _handle_update(session, target)
        for target in list(session.deleted):
            _handle_delete(session, target)

    event.listen(Session, "after_flush", _after_flush)
    _attached_listener = _after_flush
    _listeners_registered = True
