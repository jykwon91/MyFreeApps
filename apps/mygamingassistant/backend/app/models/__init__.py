# Import all models so that Alembic's env.py sees them when it imports this module.
# Order matters for forward references — declare referenced tables before referencing ones.

from app.models.user.user import User  # noqa: F401

# Game domain — taxonomy first, then dependent tables
from app.models.game.game import Game  # noqa: F401
from app.models.game.utility_type import UtilityType  # noqa: F401
from app.models.game.map import Map  # noqa: F401
from app.models.game.map_zone import MapZone  # noqa: F401
from app.models.game.site import Site  # noqa: F401
from app.models.game.source import Source  # noqa: F401
from app.models.game.lineup import Lineup  # noqa: F401
from app.models.game.lineup_package import LineupPackage, LineupPackageLineup  # noqa: F401

# Shared models from platform_shared. Importing them here registers their
# tables with ``Base.metadata`` so Alembic autogenerate + Base.metadata.create_all
# see the schema. MGA does not own these tables — platform_shared is canonical.
from platform_shared.db.models.audit_log import AuditLog  # noqa: F401
from platform_shared.db.models.auth_event import AuthEvent  # noqa: F401
