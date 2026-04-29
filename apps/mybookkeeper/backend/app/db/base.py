"""Re-export the shared SQLAlchemy declarative base.

A single ``Base`` is shared with ``platform_shared`` so models defined in the
shared package (e.g. ``platform_shared.db.models.auth_event.AuthEvent``)
register with the same ``Base.metadata`` MyBookkeeper's Alembic migrations
target. Without this unification, autogenerate would see the shared model as
a "missing" table and try to create it on every revision.
"""
from platform_shared.db.base import Base  # noqa: F401
