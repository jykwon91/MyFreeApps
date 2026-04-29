"""MBK re-exports the shared :class:`AuditLog`.

The model lives in :mod:`platform_shared.db.models.audit_log`. Keeping the
``app.models.system.audit_log`` module path means ~20 callsites elsewhere in
MBK (services, repositories, API routes, tests) continue to import unchanged.
"""
from platform_shared.db.models.audit_log import AuditLog

__all__ = ["AuditLog"]
