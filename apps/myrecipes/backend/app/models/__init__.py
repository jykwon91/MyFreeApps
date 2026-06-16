# Import all models so that Alembic's env.py sees them when it imports this module.
# Order matters for forward references -- declare referenced tables before referencing ones.

from app.models.user.user import User  # noqa: F401

# Shared models from platform_shared. Importing them here registers their
# tables with ``Base.metadata`` so Alembic autogenerate sees them.
# platform_shared is canonical -- the app does not own these tables.
from platform_shared.db.models.audit_log import AuditLog  # noqa: F401
from platform_shared.db.models.auth_event import AuthEvent  # noqa: F401

# App-specific domain models (MyRecipes). Order: parents before children for
# readability — SQLAlchemy resolves FK targets by table name, not import order.
from app.models.recipe.recipe import Recipe  # noqa: F401
from app.models.recipe.recipe_version import RecipeVersion  # noqa: F401
from app.models.recipe.recipe_ingredient import RecipeIngredient  # noqa: F401
from app.models.recipe.recipe_step import RecipeStep  # noqa: F401
from app.models.recipe.cook_log import CookLog  # noqa: F401
