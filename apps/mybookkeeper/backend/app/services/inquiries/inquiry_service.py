"""Inquiries service — orchestration only.

Per the layered-architecture rule: services orchestrate (load → decide →
persist), repositories own queries. Tenant isolation is via ``organization_id``.

Key responsibilities:
- ``create_inquiry`` runs the inquiry insert + the seed ``received`` event in
  the same ``unit_of_work`` transaction so a partial timeline is impossible.
- ``update_inquiry`` emits a stage-transition event whenever the host
  explicitly changes ``stage`` via PATCH. Other field-only updates do NOT
  emit events (timeline is for stage changes; field corrections are visible
  in the audit log).
- ``delete_inquiry`` emits an ``archived`` event before soft-deleting so
  analytics can see the host-driven retirement.

Dedup conflicts (same ``(organization_id, source, external_inquiry_id)``)
raise ``InquiryConflictError`` so the route can map to 409.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import (
    inquiry_event_repo,
    inquiry_message_repo,
    inquiry_repo,
)
from app.schemas.inquiries.inquiry_create_request import InquiryCreateRequest
from app.schemas.inquiries.inquiry_event_response import InquiryEventResponse
from app.schemas.inquiries.inquiry_list_response import InquiryListResponse
from app.schemas.inquiries.inquiry_message_response import InquiryMessageResponse
from app.schemas.inquiries.inquiry_response import InquiryResponse
from app.schemas.inquiries.inquiry_summary import InquirySummary
from app.schemas.inquiries.inquiry_update_request import InquiryUpdateRequest


class InquiryConflictError(Exception):
    """Raised when (organization_id, source, external_inquiry_id) collides."""


def _to_response(
    inquiry,
    messages=(),
    events=(),
) -> InquiryResponse:
    base = InquiryResponse.model_validate(inquiry)
    return base.model_copy(update={
        "messages": [InquiryMessageResponse.model_validate(m) for m in messages],
        "events": [InquiryEventResponse.model_validate(e) for e in events],
    })


def _to_summary(row) -> InquirySummary:
    """Map an ``InquiryWithLastMessage`` row to the inbox-card shape."""
    return InquirySummary(
        id=row.id,
        source=row.source,
        listing_id=row.listing_id,
        stage=row.stage,
        inquirer_name=row.inquirer_name,
        inquirer_employer=row.inquirer_employer,
        desired_start_date=row.desired_start_date,
        desired_end_date=row.desired_end_date,
        gut_rating=row.gut_rating,
        received_at=row.received_at,
        last_message_preview=row.last_message_preview,
        last_message_at=row.last_message_at,
    )


async def create_inquiry(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: InquiryCreateRequest,
) -> InquiryResponse:
    """Create an Inquiry and emit the seed ``received`` event atomically.

    Raises ``InquiryConflictError`` on duplicate
    ``(organization_id, source, external_inquiry_id)`` within the same org.
    """
    async with unit_of_work() as db:
        if payload.external_inquiry_id is not None:
            existing = await inquiry_repo.find_by_source_and_external_id(
                db, organization_id, payload.source, payload.external_inquiry_id,
            )
            if existing is not None:
                raise InquiryConflictError(
                    f"Inquiry from {payload.source} with external id "
                    f"{payload.external_inquiry_id!r} already exists",
                )

        inquiry = await inquiry_repo.create(
            db,
            organization_id=organization_id,
            user_id=user_id,
            source=payload.source,
            received_at=payload.received_at,
            listing_id=payload.listing_id,
            external_inquiry_id=payload.external_inquiry_id,
            inquirer_name=payload.inquirer_name,
            inquirer_email=payload.inquirer_email,
            inquirer_phone=payload.inquirer_phone,
            inquirer_employer=payload.inquirer_employer,
            desired_start_date=payload.desired_start_date,
            desired_end_date=payload.desired_end_date,
            gut_rating=payload.gut_rating,
            notes=payload.notes,
            email_message_id=payload.email_message_id,
        )

        # Seed event — same transaction so the timeline is never empty for an Inquiry.
        await inquiry_event_repo.create(
            db,
            inquiry_id=inquiry.id,
            event_type="received",
            actor="host",
            occurred_at=payload.received_at,
        )

        # Reload events to attach them to the response.
        events = await inquiry_event_repo.list_by_inquiry(db, inquiry.id)
        return _to_response(inquiry, messages=[], events=events)


async def get_inquiry(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context parity
    inquiry_id: uuid.UUID,
) -> InquiryResponse:
    async with AsyncSessionLocal() as db:
        inquiry = await inquiry_repo.get_by_id(db, inquiry_id, organization_id)
        if inquiry is None:
            raise LookupError(f"Inquiry {inquiry_id} not found")
        messages = await inquiry_message_repo.list_by_inquiry(db, inquiry.id)
        events = await inquiry_event_repo.list_by_inquiry(db, inquiry.id)
    return _to_response(inquiry, messages=messages, events=events)


async def list_inbox(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context parity
    *,
    stage: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> InquiryListResponse:
    async with AsyncSessionLocal() as db:
        rows = await inquiry_repo.list_with_last_message(
            db, organization_id, stage=stage, limit=limit, offset=offset,
        )
        total = await inquiry_repo.count_by_organization(
            db, organization_id, stage=stage,
        )
    items = [_to_summary(r) for r in rows]
    has_more = (offset + len(items)) < total
    return InquiryListResponse(items=items, total=total, has_more=has_more)


async def update_inquiry(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context parity
    inquiry_id: uuid.UUID,
    payload: InquiryUpdateRequest,
) -> InquiryResponse:
    """Apply allowlisted updates. If ``stage`` changes, emit a stage event."""
    fields = payload.to_update_dict()

    async with unit_of_work() as db:
        existing = await inquiry_repo.get_by_id(db, inquiry_id, organization_id)
        if existing is None:
            raise LookupError(f"Inquiry {inquiry_id} not found")

        new_stage = fields.get("stage")
        old_stage = existing.stage

        inquiry = await inquiry_repo.update_inquiry(
            db, inquiry_id, organization_id, fields,
        )
        # update_inquiry only returns None for the not-found / wrong-org case,
        # which we already ruled out above. Defensive assert keeps the type narrow.
        assert inquiry is not None

        if new_stage is not None and new_stage != old_stage:
            await inquiry_event_repo.create(
                db,
                inquiry_id=inquiry.id,
                event_type=new_stage,
                actor="host",
                occurred_at=_dt.datetime.now(_dt.timezone.utc),
            )

        messages = await inquiry_message_repo.list_by_inquiry(db, inquiry.id)
        events = await inquiry_event_repo.list_by_inquiry(db, inquiry.id)
        return _to_response(inquiry, messages=messages, events=events)


async def delete_inquiry(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context parity
    inquiry_id: uuid.UUID,
) -> None:
    """Soft-delete and emit an ``archived`` event in the same transaction."""
    async with unit_of_work() as db:
        inquiry = await inquiry_repo.get_by_id(db, inquiry_id, organization_id)
        if inquiry is None:
            raise LookupError(f"Inquiry {inquiry_id} not found")
        await inquiry_event_repo.create(
            db,
            inquiry_id=inquiry.id,
            event_type="archived",
            actor="host",
            occurred_at=_dt.datetime.now(_dt.timezone.utc),
            notes="Soft-deleted by host",
        )
        deleted = await inquiry_repo.soft_delete_by_id(
            db, inquiry_id, organization_id,
        )
        if not deleted:
            # Should be impossible because we just confirmed the row exists in
            # the same transaction, but keep the safety check rather than rely
            # on invariants.
            raise LookupError(f"Inquiry {inquiry_id} not found")
