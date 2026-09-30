# Import all models so that Alembic's env.py sees them when it imports this module.
# Order matters for forward references -- declare referenced tables before referencing ones.

from app.models.user.user import User  # noqa: F401

# Shared models from platform_shared. Importing them here registers their
# tables with ``Base.metadata`` so Alembic autogenerate sees them.
# platform_shared is canonical -- the app does not own these tables.
from platform_shared.db.models.audit_log import AuditLog  # noqa: F401
from platform_shared.db.models.auth_event import AuthEvent  # noqa: F401
# Opt-in shared model: durable per-bucket daily counter. Provisioned in 0002;
# the token quota service that consumes it lands with the tutor turns (PR 4).
from platform_shared.db.models.daily_usage_counter import DailyUsageCounter  # noqa: F401

# App-specific domain models (MyLanguageTutor). Parents before children.
from app.models.tutor.tutor_session import TutorSession  # noqa: F401
from app.models.tutor.tutor_turn import TutorTurn  # noqa: F401
