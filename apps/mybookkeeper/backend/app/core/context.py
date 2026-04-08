"""Request context — carries org/user/role through the service layer."""
import uuid

from app.models.organization.organization_member import OrgRole


# Re-export RequestContext from shared but with app-specific OrgRole typing
from platform_shared.core.context import RequestContext  # noqa: F401


def worker_context(organization_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    """Build a context for background workers where role checks are not needed."""
    return RequestContext(
        organization_id=organization_id,
        user_id=user_id,
        org_role=OrgRole.OWNER,
    )
