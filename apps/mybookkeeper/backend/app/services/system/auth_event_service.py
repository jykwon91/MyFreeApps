import uuid
from typing import Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.request_utils import get_client_ip
from app.models.system.auth_event import AuthEvent


async def log_auth_event(
    db: AsyncSession,
    *,
    event_type: str,
    user_id: Optional[uuid.UUID] = None,
    request: Optional[Request] = None,
    succeeded: bool = True,
    metadata: Optional[dict] = None,
) -> None:
    """Append an auth event row to the session.

    Deliberately does not flush — the caller's transaction will commit.
    Never log sensitive values (passwords, tokens) in metadata.
    """
    ip: Optional[str] = None
    ua: Optional[str] = None
    if request is not None:
        ip = get_client_ip(request)
        raw_ua = request.headers.get("user-agent")
        if raw_ua:
            ua = raw_ua[:500]

    event = AuthEvent(
        user_id=user_id,
        event_type=event_type,
        ip_address=ip,
        user_agent=ua,
        succeeded=succeeded,
        event_metadata=metadata or {},
    )
    db.add(event)
