"""SQLAlchemy audit logging via event listeners.

This module captures INSERT / UPDATE / DELETE events on every flush and writes
per-field rows into the shared ``audit_logs`` table. Each consuming app passes
its own :class:`~platform_shared.core.audit_config.AuditConfig`: the column
names masked as ``"***"`` (PII, secrets, tokens, every ``EncryptedString``
column), the tables skipped entirely, and the columns left out of audit rows.

The configuration is a required argument of :func:`register_audit_listeners`,
so the listener cannot attach without it. Apps build their ``AuditConfig`` in
``app/core/audit.py`` and pass it to the lifespan factory::

    lifespan = create_app_lifespan(settings=settings, audit_config=AUDIT_CONFIG, ...)

Before attaching, the configuration is checked against the mapped models and
boot fails (:class:`AuditConfigurationError`) if a sensitive field, skip field
or skip table matches no column or table, or if an audited ``EncryptedString``
column is not masked. The lifespan also fails boot when an app's configuration
leaves out the shared baseline (:func:`verify_audit_baseline`).

The audit table itself is always skipped to prevent recursion. The listener
writes ``changed_by`` from the ``current_user_id`` ContextVar by default; pass
``get_actor`` to override.

Legacy registry (MyGamingAssistant only): MGA still registers its sets through
``register_sensitive_fields`` / ``register_skip_tables`` /
``register_skip_fields`` at import time and calls ``create_app_lifespan``
without ``audit_config``; the lifespan then reads :func:`registered_audit_config`,
which refuses to return an empty configuration. Every other app passes its
``AuditConfig`` explicitly. Delete the registry once MGA does too.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable
from contextvars import ContextVar
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.orm.attributes import NO_VALUE
from sqlalchemy.orm.base import NEVER_SET

from platform_shared.core.audit_baseline_constants import (
    AUDIT_BASELINE_SENSITIVE_FIELDS,
    AUDIT_BASELINE_SKIP_TABLES,
)
from platform_shared.core.audit_config import AuditConfig
from platform_shared.core.audit_erasure_constants import MASKED_AUDIT_VALUE
from platform_shared.core.encrypted_string_type import EncryptedString
from platform_shared.db.base import Base
from platform_shared.db.models.audit_log import AuditLog


class AuditConfigurationError(RuntimeError):
    """Raised when the audit configuration would let plaintext reach
    ``audit_logs``: no configuration at all, a configured name that matches no
    ORM column or table, a missing baseline entry, an unmasked
    ``EncryptedString`` column, or a second listener with a different
    configuration.
    """


# Actor identifier for the ``changed_by`` column. The shared request middleware
# sets it per request; a background job sets it with ``audit_actor`` (in
# ``platform_shared.core.audit_actor``) for the user it acts for.
current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)

# Legacy registry, populated at import time by MGA's app/core/audit.py.
_registered_sensitive_fields: set[str] = set()
_registered_skip_tables: set[str] = set()
_registered_skip_fields: set[str] = set()

# The attached listener and the configuration it closes over. Process-global
# because SQLAlchemy's event registry is.
_attached_listener: Callable[[Session, Any], None] | None = None
_attached_config: AuditConfig | None = None


def register_sensitive_fields(field_names: Iterable[str]) -> None:
    """Legacy (MGA only): add column names to mask. Prefer :class:`AuditConfig`."""
    _registered_sensitive_fields.update(field_names)


def register_skip_tables(table_names: Iterable[str]) -> None:
    """Legacy (MGA only): add table names to skip. Prefer :class:`AuditConfig`."""
    _registered_skip_tables.update(table_names)


def register_skip_fields(field_names: Iterable[str]) -> None:
    """Legacy (MGA only): add column names to leave out. Prefer :class:`AuditConfig`."""
    _registered_skip_fields.update(field_names)


def registered_audit_config() -> AuditConfig:
    """The legacy registry as an :class:`AuditConfig`.

    Raises:
        AuditConfigurationError: when nothing was registered. That means the
            module that registers the app's sets was never imported, and the
            listener would copy every secret into ``audit_logs`` in cleartext.
    """
    if not _registered_sensitive_fields:
        raise AuditConfigurationError(
            "No audit configuration: create_app_lifespan was called without "
            "audit_config and no sensitive fields were registered. The audit "
            "listener would copy secrets and PII into audit_logs in cleartext. "
            "Pass audit_config=AUDIT_CONFIG (from app/core/audit.py) to "
            "create_app_lifespan.",
        )
    return AuditConfig(
        sensitive_fields=frozenset(_registered_sensitive_fields),
        skip_tables=frozenset(_registered_skip_tables),
        skip_fields=frozenset(_registered_skip_fields),
    )


def attached_audit_config() -> AuditConfig | None:
    """The configuration the attached listener masks with, or None if none is attached."""
    return _attached_config


def _all_mapped_column_keys(base: type[DeclarativeBase]) -> set[str]:
    return {col.key for table in base.metadata.tables.values() for col in table.columns}


def _all_table_names(base: type[DeclarativeBase]) -> set[str]:
    return {table.name for table in base.metadata.tables.values()}


def _unmasked_encrypted_columns(config: AuditConfig, base: type[DeclarativeBase]) -> list[str]:
    """``table.attribute`` for every audited :class:`EncryptedString` column
    whose attribute key is neither masked nor skipped.

    The ORM attribute holds the DECRYPTED value, so the listener would copy it
    into ``audit_logs`` as cleartext. Walks the mappers (not the tables) because
    the listener matches on ``attr.key`` and ``target.__tablename__``.
    """
    unmasked: list[str] = []
    for mapper in base.registry.mappers:
        table_name = getattr(mapper.class_, "__tablename__", None)
        if table_name is None or table_name in config.skip_tables:
            continue
        for prop in mapper.column_attrs:
            if prop.key in config.sensitive_fields or prop.key in config.skip_fields:
                continue
            if any(isinstance(col.type, EncryptedString) for col in prop.columns):
                unmasked.append(f"{table_name}.{prop.key}")
    return sorted(set(unmasked))


def _list_config_names(names_by_field: dict[str, frozenset[str]]) -> str:
    """``AuditConfig.<field>: [sorted names]`` for each field with names, ``; ``-joined."""
    return "; ".join(
        f"AuditConfig.{field}: {sorted(names)}" for field, names in names_by_field.items() if names
    )


def verify_audit_config(config: AuditConfig, *, base: type[DeclarativeBase] = Base) -> None:
    """Raise :class:`AuditConfigurationError` if ``config`` would let plaintext
    reach ``audit_logs`` for the models mapped on ``base``:

    1. a name matches nothing in the mapped models: a sensitive field or skip
       field that is no column attribute on any mapped class, or a skip table
       that is no mapped table. A typo means the mask or skip never fires (how
       plaintext TOTP secrets leaked in MJH + MGA before this check), and the
       column or table it was meant for is audited in full. Sensitive and skip
       fields match a column of that name in every table, as the listener does.
    2. an audited :class:`EncryptedString` column is not a sensitive field (or
       skip field, or on a skip table). The ORM attribute is the decrypted
       value, so encryption at rest would be undone in the audit table.

    Every model module must be imported before this runs; apps' ``app.main``
    imports them all before the lifespan starts.
    """
    column_keys = _all_mapped_column_keys(base)
    unknown = {
        "sensitive_fields": config.sensitive_fields - column_keys,
        "skip_fields": config.skip_fields - column_keys,
        "skip_tables": config.skip_tables - _all_table_names(base),
    }
    unknown_listed = _list_config_names(unknown)
    if unknown_listed:
        raise AuditConfigurationError(
            f"AuditConfig names that don't match any mapped column or table: {unknown_listed}. "
            "A mask or skip on a name that matches nothing never fires, so the column or "
            "table it was meant for is copied into audit_logs in plaintext. Check spelling "
            "against the actual SQLAlchemy attribute and table names on your models.",
        )
    unmasked = _unmasked_encrypted_columns(config, base)
    if unmasked:
        raise AuditConfigurationError(
            f"EncryptedString columns are not masked in audit_logs: {unmasked}. "
            "The audit listener reads the decrypted attribute value, so these "
            "columns would be copied into audit_logs as cleartext. Add each "
            "attribute name to the app's sensitive fields in app/core/audit.py "
            "(or skip the column or table there if it shouldn't be audited).",
        )


def verify_audit_baseline(config: AuditConfig) -> None:
    """Raise :class:`AuditConfigurationError` if an app's ``config`` leaves out
    any of the shared baseline (:mod:`platform_shared.core.audit_baseline_constants`):
    the auth secrets every app's user table has, and the secret-bearing tables
    every app has.

    The app boot path (:func:`platform_shared.core.lifespan.create_app_lifespan`)
    runs this before attaching the listener. It is not part of
    :func:`verify_audit_config`, which checks any configuration against any
    models, including test models that have no user table.
    """
    missing = {
        "sensitive_fields": AUDIT_BASELINE_SENSITIVE_FIELDS - config.sensitive_fields,
        "skip_tables": AUDIT_BASELINE_SKIP_TABLES - config.skip_tables,
    }
    missing_listed = _list_config_names(missing)
    if missing_listed:
        raise AuditConfigurationError(
            f"The app's AuditConfig is missing the shared baseline: {missing_listed}. "
            "Every app has these auth secrets and secret-bearing tables, and without "
            "them their values are copied into audit_logs. Add them to app/core/audit.py "
            "(see platform_shared.core.audit_baseline_constants).",
        )


def reset_registry() -> None:
    """Detach the listener and clear the legacy registry. Test-only.

    Production code must never call this — it removes auditing for every
    subsequent flush. The SQLAlchemy event registry is process-global, so
    tests that attach the listener detach it here.
    """
    global _attached_listener, _attached_config
    _registered_sensitive_fields.clear()
    _registered_skip_tables.clear()
    _registered_skip_fields.clear()
    if _attached_listener is not None:
        event.remove(Session, "after_flush", _attached_listener)
    _attached_listener = None
    _attached_config = None


def format_record_id(pk_values: Iterable[Any]) -> str:
    """The ``audit_logs.record_id`` for a row with these primary-key values."""
    return ",".join(str(value) for value in pk_values)


def _get_record_id(target: Any) -> str:
    pk = inspect(target.__class__).primary_key
    return format_record_id(getattr(target, col.name, "") for col in pk)


def _serialize(value: Any) -> str | None:
    return None if value is None else str(value)


def _is_loaded(attr: Any) -> bool:
    """Return False for deferred / expired attributes to avoid lazy-load on flush."""
    return attr.loaded_value not in (NEVER_SET, NO_VALUE)


def register_audit_listeners(
    config: AuditConfig,
    *,
    audit_log_model: type = AuditLog,
    get_actor: Callable[[], str | None] | None = None,
    base: type[DeclarativeBase] = Base,
) -> None:
    """Verify ``config`` and attach the after_flush listener that writes audit rows.

    Args:
        config: The app's masking configuration. Required: the listener never
            runs without it.
        audit_log_model: ORM class to use for audit rows. Defaults to the shared
            :class:`platform_shared.db.models.audit_log.AuditLog`. Its table is
            always skipped (recursion guard).
        get_actor: Callable returning the current actor's user-id string for
            the ``changed_by`` column. Defaults to reading :data:`current_user_id`.
        base: The declarative base whose mapped models ``config`` is verified
            against. Apps use the shared default; tests with their own models
            pass their base.

    Idempotent for the same ``config`` (uvicorn reloader restarts, repeated
    lifespans in one test process).

    Raises:
        AuditConfigurationError: when :func:`verify_audit_config` fails, or a
            listener is already attached with a different configuration. The
            listener is not attached in either case.
    """
    global _attached_listener, _attached_config
    if _attached_config is not None:
        if _attached_config == config:
            return
        raise AuditConfigurationError(
            "An audit listener is already attached with a different AuditConfig. "
            "One process audits with one configuration.",
        )

    verify_audit_config(config, base=base)

    actor: Callable[[], str | None] = get_actor or (lambda: current_user_id.get())
    sensitive_fields = config.sensitive_fields
    skip_fields = config.skip_fields
    skip_tables = config.skip_tables | {audit_log_model.__tablename__}

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
        if target.__tablename__ in skip_tables:
            return
        record_id = _get_record_id(target)
        for attr in inspect(target).attrs:
            if attr.key in skip_fields or not _is_loaded(attr):
                continue
            new_val = MASKED_AUDIT_VALUE if attr.key in sensitive_fields else _serialize(attr.value)
            _create_log(session, target.__tablename__, record_id, "INSERT", attr.key, None, new_val)

    def _handle_update(session: Session, target: Any) -> None:
        if target.__tablename__ in skip_tables:
            return
        record_id = _get_record_id(target)
        for attr in inspect(target).attrs:
            if attr.key in skip_fields:
                continue
            hist = attr.history
            if not hist.has_changes():
                continue
            old = hist.deleted[0] if hist.deleted else None
            new = hist.added[0] if hist.added else None
            if attr.key in sensitive_fields:
                old_val = MASKED_AUDIT_VALUE if old is not None else None
                new_val = MASKED_AUDIT_VALUE if new is not None else None
            else:
                old_val, new_val = _serialize(old), _serialize(new)
            _create_log(session, target.__tablename__, record_id, "UPDATE", attr.key, old_val, new_val)

    def _handle_delete(session: Session, target: Any) -> None:
        if target.__tablename__ in skip_tables:
            return
        record_id = _get_record_id(target)
        for attr in inspect(target).attrs:
            if attr.key in skip_fields or not _is_loaded(attr):
                continue
            old_val = MASKED_AUDIT_VALUE if attr.key in sensitive_fields else _serialize(attr.value)
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
    _attached_config = config
