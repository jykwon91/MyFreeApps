"""Who may send rent reminders by text.

Every text goes out from the operator's own Twilio number, so only an admin
account may send them. A plan's texts are sent as its owner (``plan.user_id``),
which is also who the check is made for, on the scheduled tick as on Send now.
"""
from __future__ import annotations

import uuid

from platform_shared.core.permissions import Role

from app.models.user.user import User
from app.repositories.user import user_repo


def may_send_texts(user: User | None) -> bool:
    return user is not None and user.role == Role.ADMIN


async def owner_may_send_texts(db, user_id: uuid.UUID) -> bool:
    return may_send_texts(await user_repo.get_by_id(db, user_id))
