"""Shared write helper for the ``auth_events`` audit table.

Caller passes in the SQLAlchemy session — this helper is decoupled from any
app-specific session factory. It deliberately does not flush; the caller's
transaction commits.

Never log sensitive values (passwords, tokens, full email addresses for
unknown users) in metadata. For anonymous failed-login attempts, write
``user_id=None`` and only ``metadata.email_domain`` — never the full email.
"""
import uuid
from typing import Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.request_utils import get_client_ip
from platform_shared.db.models.auth_event import AuthEvent


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
