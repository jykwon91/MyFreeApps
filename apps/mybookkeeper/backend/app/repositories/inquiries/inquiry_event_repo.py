"""Repository for ``inquiry_events`` — append-only.

No update or delete methods by design — events are immutable timeline records
that power analytics (RENTALS_PLAN.md §7.1: conversion funnel,
days-to-first-response). Mutating the timeline would invalidate metrics.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry_event import InquiryEvent


async def create(
    db: AsyncSession,
    *,
    inquiry_id: uuid.UUID,
    event_type: str,
    actor: str,
    occurred_at: _dt.datetime,
    notes: str | None = None,
) -> InquiryEvent:
    event = InquiryEvent(
        inquiry_id=inquiry_id,
        event_type=event_type,
        actor=actor,
        notes=notes,
        occurred_at=occurred_at,
    )
    db.add(event)
    await db.flush()
    return event


async def list_by_inquiry(
    db: AsyncSession,
    inquiry_id: uuid.UUID,
) -> list[InquiryEvent]:
    """Return events for an inquiry in chronological (occurred_at asc) order."""
    result = await db.execute(
        select(InquiryEvent)
        .where(InquiryEvent.inquiry_id == inquiry_id)
        .order_by(asc(InquiryEvent.occurred_at))
    )
    return list(result.scalars().all())
