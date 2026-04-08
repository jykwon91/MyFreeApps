"""Request context — carries org/user/role through the service layer."""
import uuid
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RequestContext:
    """Immutable context for an authenticated request within an organization."""
    organization_id: uuid.UUID
    user_id: uuid.UUID
    org_role: str


def worker_context(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str = "owner",
) -> RequestContext:
    """Build a context for background workers where role checks are not needed."""
    return RequestContext(
        organization_id=organization_id,
        user_id=user_id,
        org_role=role,
    )
