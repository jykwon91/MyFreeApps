"""Request context — carries org/user/role through the service layer."""
import uuid
from dataclasses import dataclass

from app.models.organization.organization_member import OrgRole


@dataclass(frozen=True, slots=True)
class RequestContext:
    """Immutable context for an authenticated request within an organization."""
    organization_id: uuid.UUID
    user_id: uuid.UUID
    org_role: OrgRole


def worker_context(organization_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    """Build a context for background workers where role checks are not needed."""
    return RequestContext(
        organization_id=organization_id,
        user_id=user_id,
        org_role=OrgRole.OWNER,
    )
