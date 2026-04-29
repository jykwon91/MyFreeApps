"""MBK's ``Base`` is the shared :class:`platform_shared.db.base.Base`.

Re-exported so the 50+ existing ``from app.db.base import Base`` imports keep
working unchanged. Models registered against this Base land in
``platform_shared.db.base.Base.metadata`` — the same metadata the shared
:class:`platform_shared.db.models.audit_log.AuditLog` and
:class:`platform_shared.db.models.auth_event.AuthEvent` use, so alembic's
``target_metadata`` sees both MBK-defined and shared tables in one pass.
"""
from platform_shared.db.base import Base

__all__ = ["Base"]
