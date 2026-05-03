"""Repository for ``inquiries`` — owns every query against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows or typed read models. The dedup
helpers (``find_by_email_message_id``, ``find_by_source_and_external_id``)
exist for the PR 2.2 email reconciler and ALWAYS scope by tenant.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_message import InquiryMessage
from app.schemas.inquiries.inquiry_with_last_message import InquiryWithLastMessage

# Allowlist of columns updatable via PATCH /inquiries/{id}. ``source``,
# ``external_inquiry_id``, ``email_message_id``, tenant scoping (org/user_id)
# and server-managed columns are deliberately excluded — once an inquiry's
# origin is set it never changes (re-routing happens via stage='archived').
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "listing_id",
    "inquirer_name",
    "inquirer_email",
    "inquirer_phone",
    "inquirer_employer",
    "desired_start_date",
    "desired_end_date",
    "stage",
    "gut_rating",
    "notes",
    # T0 — operator can override spam triage from the inbox.
    "spam_status",
})

# How many characters of the last message body to surface as a preview in
# the inbox card. Keep this conservative — long previews push other fields
# below the fold on mobile.
_LAST_MESSAGE_PREVIEW_LEN = 120


async def get_by_id(
    db: AsyncSession,
    inquiry_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> Inquiry | None:
    """Return the inquiry iff it exists, is not soft-deleted, and belongs to the org."""
    result = await db.execute(
        select(Inquiry).where(
            Inquiry.id == inquiry_id,
            Inquiry.organization_id == organization_id,
            Inquiry.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    source: str,
    received_at: _dt.datetime,
    listing_id: uuid.UUID | None = None,
    external_inquiry_id: str | None = None,
    inquirer_name: str | None = None,
    inquirer_email: str | None = None,
    inquirer_phone: str | None = None,
    inquirer_employer: str | None = None,
    desired_start_date: _dt.date | None = None,
    desired_end_date: _dt.date | None = None,
    gut_rating: int | None = None,
    notes: str | None = None,
    email_message_id: str | None = None,
    submitted_via: str = "manual_entry",
    spam_status: str = "unscored",
    spam_score: float | None = None,
    move_in_date: _dt.date | None = None,
    lease_length_months: int | None = None,
    occupant_count: int | None = None,
    has_pets: bool | None = None,
    pets_description: str | None = None,
    vehicle_count: int | None = None,
    current_city: str | None = None,
    employment_status: str | None = None,
    why_this_room: str | None = None,
    additional_notes: str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> Inquiry:
    """Persist an Inquiry. ``stage`` is forced to ``'new'`` on create."""
    inquiry = Inquiry(
        organization_id=organization_id,
        user_id=user_id,
        listing_id=listing_id,
        source=source,
        external_inquiry_id=external_inquiry_id,
        inquirer_name=inquirer_name,
        inquirer_email=inquirer_email,
        inquirer_phone=inquirer_phone,
        inquirer_employer=inquirer_employer,
        desired_start_date=desired_start_date,
        desired_end_date=desired_end_date,
        stage="new",
        gut_rating=gut_rating,
        notes=notes,
        received_at=received_at,
        email_message_id=email_message_id,
        submitted_via=submitted_via,
        spam_status=spam_status,
        spam_score=spam_score,
        move_in_date=move_in_date,
        lease_length_months=lease_length_months,
        occupant_count=occupant_count,
        has_pets=has_pets,
        pets_description=pets_description,
        vehicle_count=vehicle_count,
        current_city=current_city,
        employment_status=employment_status,
        why_this_room=why_this_room,
        additional_notes=additional_notes,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    db.add(inquiry)
    await db.flush()
    return inquiry


async def update_spam_triage(
    db: AsyncSession,
    inquiry_id: uuid.UUID,
    *,
    spam_status: str,
    spam_score: float | None = None,
) -> Inquiry | None:
    """Apply the final spam_status + spam_score after the filter pipeline.

    Distinct from ``update_inquiry`` because it doesn't go through the
    operator-facing allowlist — these columns are written by the public
    ingest path itself, never by a route handler driven by client input.
    """
    result = await db.execute(
        select(Inquiry).where(Inquiry.id == inquiry_id)
    )
    inquiry = result.scalar_one_or_none()
    if inquiry is None:
        return None
    inquiry.spam_status = spam_status
    inquiry.spam_score = spam_score
    await db.flush()
    return inquiry


async def update_inquiry(
    db: AsyncSession,
    inquiry_id: uuid.UUID,
    organization_id: uuid.UUID,
    fields: dict[str, Any],
) -> Inquiry | None:
    """Apply allowlisted updates to an inquiry. Returns None if not found / wrong org."""
    inquiry = await get_by_id(db, inquiry_id, organization_id)
    if inquiry is None:
        return None
    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return inquiry
    for key, value in safe_fields.items():
        setattr(inquiry, key, value)
    await db.flush()
    return inquiry


async def soft_delete_by_id(
    db: AsyncSession,
    inquiry_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    """Soft-delete an inquiry. Returns True iff a row was updated."""
    result = await db.execute(
        update(Inquiry)
        .where(
            Inquiry.id == inquiry_id,
            Inquiry.organization_id == organization_id,
            Inquiry.deleted_at.is_(None),
        )
        .values(deleted_at=_dt.datetime.now(_dt.timezone.utc))
    )
    return (result.rowcount or 0) > 0


async def hard_delete_by_id(
    db: AsyncSession,
    inquiry_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> None:
    """Hard-delete an inquiry scoped to an organization. Test-utility only —
    production code uses soft-delete (set ``deleted_at``).

    The ``inquiry_messages`` and ``inquiry_events`` rows cascade off the FK
    ``ON DELETE CASCADE`` so a single delete is enough.
    """
    await db.execute(
        delete(Inquiry).where(
            Inquiry.id == inquiry_id,
            Inquiry.organization_id == organization_id,
        )
    )


async def count_by_organization(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    stage: str | None = None,
    spam_status: str | None = None,
) -> int:
    """Count active (non-deleted) inquiries for the inbox total.

    ``spam_status`` is used by the inbox tabs ("All" / "Clean" / "Flagged" /
    "Spam") so each tab's count reflects its filtered subset.
    """
    stmt = select(func.count(Inquiry.id)).where(
        Inquiry.organization_id == organization_id,
        Inquiry.deleted_at.is_(None),
    )
    if stage is not None:
        stmt = stmt.where(Inquiry.stage == stage)
    if spam_status is not None:
        stmt = stmt.where(Inquiry.spam_status == spam_status)
    result = await db.execute(stmt)
    return int(result.scalar_one() or 0)


async def list_with_last_message(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    stage: str | None = None,
    spam_status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[InquiryWithLastMessage]:
    """List inquiries with the most-recent ``InquiryMessage`` joined per row.

    Implementation note: PostgreSQL supports LATERAL joins natively but SQLite
    (used by the unit-test fixture) does not. We use a portable correlated
    subquery via ``order_by + limit(1)`` to identify the latest message per
    inquiry. The covering index ``(inquiry_id, created_at DESC)`` makes this
    O(log n) per inquiry on PostgreSQL — equivalent to LATERAL in practice.

    Returns ``InquiryWithLastMessage`` rows so the service layer doesn't have
    to know the join shape.
    """
    # Subquery: for each inquiry, the id of its latest message (NULL if none).
    latest_msg_id_sq = (
        select(InquiryMessage.id)
        .where(InquiryMessage.inquiry_id == Inquiry.id)
        .order_by(desc(InquiryMessage.created_at))
        .limit(1)
        .scalar_subquery()
        .correlate(Inquiry)
    )

    # Alias for joining the chosen message back in (so we can read its fields).
    last_msg = InquiryMessage

    stmt = (
        select(
            Inquiry.id,
            Inquiry.source,
            Inquiry.listing_id,
            Inquiry.stage,
            Inquiry.inquirer_name,
            Inquiry.inquirer_employer,
            Inquiry.desired_start_date,
            Inquiry.desired_end_date,
            Inquiry.gut_rating,
            Inquiry.received_at,
            Inquiry.spam_status,
            Inquiry.spam_score,
            Inquiry.submitted_via,
            last_msg.id.label("last_message_id"),
            last_msg.parsed_body.label("last_message_parsed_body"),
            last_msg.raw_email_body.label("last_message_raw_body"),
            last_msg.created_at.label("last_message_at"),
        )
        .outerjoin(last_msg, last_msg.id == latest_msg_id_sq)
        .where(
            Inquiry.organization_id == organization_id,
            Inquiry.deleted_at.is_(None),
        )
    )
    if stage is not None:
        stmt = stmt.where(Inquiry.stage == stage)
    if spam_status is not None:
        stmt = stmt.where(Inquiry.spam_status == spam_status)
    stmt = stmt.order_by(desc(Inquiry.received_at)).limit(limit).offset(offset)

    result = await db.execute(stmt)
    rows = result.all()
    items: list[InquiryWithLastMessage] = []
    for row in rows:
        body = row.last_message_parsed_body or row.last_message_raw_body
        preview = (
            body[:_LAST_MESSAGE_PREVIEW_LEN] if body is not None else None
        )
        items.append(InquiryWithLastMessage(
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
            spam_status=row.spam_status,
            spam_score=float(row.spam_score) if row.spam_score is not None else None,
            submitted_via=row.submitted_via,
            last_message_id=row.last_message_id,
            last_message_preview=preview,
            last_message_at=row.last_message_at,
        ))
    return items


async def find_by_email_message_id(
    db: AsyncSession,
    user_id: uuid.UUID,
    email_message_id: str,
) -> Inquiry | None:
    """Dedup helper for the PR 2.2 reconciler. Scoped by user_id (matches the
    partial UNIQUE on the table)."""
    result = await db.execute(
        select(Inquiry).where(
            Inquiry.user_id == user_id,
            Inquiry.email_message_id == email_message_id,
        )
    )
    return result.scalar_one_or_none()


async def find_by_source_and_external_id(
    db: AsyncSession,
    organization_id: uuid.UUID,
    source: str,
    external_inquiry_id: str,
) -> Inquiry | None:
    """Dedup helper for the PR 2.2 reconciler. Scoped by organization_id —
    two orgs can independently track FF inquiry "I-123" without colliding."""
    result = await db.execute(
        select(Inquiry).where(
            Inquiry.organization_id == organization_id,
            Inquiry.source == source,
            Inquiry.external_inquiry_id == external_inquiry_id,
        )
    )
    return result.scalar_one_or_none()


async def get_by_applicant_inquiry_id(
    db: AsyncSession,
    inquiry_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Inquiry | None:
    """Return the inquiry linked from an applicant's ``inquiry_id``.

    Scoped by both ``organization_id`` and ``user_id`` — dual tenant check
    per the project's multi-tenant isolation pattern. Returns ``None`` if the
    inquiry is soft-deleted or belongs to a different tenant.
    """
    result = await db.execute(
        select(Inquiry).where(
            Inquiry.id == inquiry_id,
            Inquiry.organization_id == organization_id,
            Inquiry.user_id == user_id,
            Inquiry.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()
