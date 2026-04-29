"""Shared SQLAlchemy ORM models that ship with platform_shared.

Importing this package registers every model class with
``platform_shared.db.base.Base.metadata`` so consumer apps that include
``Base.metadata`` in their alembic ``target_metadata`` see the schema.
"""
from platform_shared.db.models.audit_log import AuditLog

__all__ = ["AuditLog"]
