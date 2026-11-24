"""A property's current value, as the person says it is.

Saved dated today, with today's net worth snapshot in the same unit of work,
so the chart moves the moment the value does.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.db.session import unit_of_work
from app.repositories.properties import property_repo
from app.schemas.properties.property_value_response import PropertyValueResponse
from app.services.net_worth import net_worth_service
from app.services.properties.property_not_found_error import PropertyNotFoundError


async def set_estimated_value(
    *,
    property_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    value_cents: int | None,
    today: _dt.date,
) -> PropertyValueResponse:
    async with unit_of_work() as db:
        prop = await property_repo.get_by_id(db, property_id, organization_id)
        if prop is None:
            raise PropertyNotFoundError(str(property_id))
        prop = await property_repo.set_estimated_value(
            db, prop, value_cents=value_cents, as_of=None if value_cents is None else today,
        )
        await net_worth_service.record_today(
            db, organization_id=organization_id, user_id=user_id, today=today,
        )
        return PropertyValueResponse(
            property_id=prop.id,
            estimated_value_cents=prop.estimated_value_cents,
            estimated_value_as_of=prop.estimated_value_as_of,
        )
