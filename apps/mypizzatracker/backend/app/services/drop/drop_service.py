"""Drop business-logic service.

Owns the state machine and edit policy:

  Allowed transitions:
    planning -> active   (requires >= 1 slot)
    planning -> closed   (cancel a never-run drop)
    active   -> closed   (service complete)

  Edit policy (PATCH fields):
    planning : name, date, slot_window_start, slot_window_end, status, tip_total
    active   : status (only -> closed), tip_total
    closed   : nothing (terminal)

  Delete policy:
    planning : allowed
    active   : blocked (must close first)
    closed   : blocked (financial history)

Repositories handle the SQL; this layer enforces the rules and raises
domain exceptions the API layer translates to HTTP. Every mutation owns its
transaction through ``unit_of_work``: it commits when the function returns
and rolls back when a rule violation is raised.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.drop.drop import Drop
from app.models.drop.slot import Slot
from app.repositories.drop import drop_repo
from app.schemas.drop.drop_schemas import (
    DropCreate,
    DropUpdate,
    SlotCreate,
    SlotUpdate,
)

DROP_STATUSES: tuple[str, ...] = ("planning", "active", "closed")

# (from_status, to_status) pairs that are allowed.
_ALLOWED_TRANSITIONS: frozenset[tuple[str, str]] = frozenset({
    ("planning", "active"),
    ("planning", "closed"),
    ("active", "closed"),
})

# Fields editable in each status (in addition to the status field itself).
_EDITABLE_FIELDS: dict[str, frozenset[str]] = {
    "planning": frozenset({
        "name", "date", "slot_window_start", "slot_window_end", "tip_total",
    }),
    "active": frozenset({"tip_total"}),
    "closed": frozenset(),
}


class DropServiceError(Exception):
    """Base class for service-layer rule violations."""

    http_status: int = 400


class DropNotFoundError(DropServiceError):
    http_status = 404


class InvalidStatusTransitionError(DropServiceError):
    pass


class DropNotEditableError(DropServiceError):
    pass


class DropNotDeletableError(DropServiceError):
    pass


class SlotRequiredError(DropServiceError):
    """Cannot activate a drop without at least one slot."""


class SlotNotFoundError(DropServiceError):
    http_status = 404


class SlotEditingClosedError(DropServiceError):
    """Cannot modify slots on a closed drop."""


# ---------------------------------------------------------------------------
# Drops
# ---------------------------------------------------------------------------

async def create_drop(body: DropCreate) -> Drop:
    """Create a new drop in ``planning`` state."""
    data = body.model_dump()
    # Status defaults to "planning" via the model; do not let callers override.
    async with unit_of_work() as db:
        return await drop_repo.create_drop(db, data)


async def get_drop_or_404(db: AsyncSession, drop_id: uuid.UUID) -> Drop:
    drop = await drop_repo.get_drop(db, drop_id)
    if drop is None:
        raise DropNotFoundError(f"Drop {drop_id} not found")
    return drop


async def list_drops(db: AsyncSession, *, status: Optional[str] = None) -> list[Drop]:
    if status is not None and status not in DROP_STATUSES:
        raise DropServiceError(f"Invalid status filter: {status}")
    return await drop_repo.list_drops(db, status=status)


async def update_drop(drop_id: uuid.UUID, body: DropUpdate) -> Drop:
    """Apply a partial update respecting the per-status edit policy."""
    patch = body.model_dump(exclude_unset=True)

    new_status = patch.pop("status", None)

    async with unit_of_work() as db:
        drop = await get_drop_or_404(db, drop_id)

        # Reject edits to non-editable fields for the current status.
        editable = _EDITABLE_FIELDS[drop.status]
        bad_fields = set(patch.keys()) - editable
        if bad_fields:
            raise DropNotEditableError(
                f"Cannot edit {sorted(bad_fields)} when drop is in '{drop.status}'",
            )

        # If a status change is requested, validate and apply.
        if new_status is not None and new_status != drop.status:
            await _transition_status(db, drop, new_status)
            # _transition_status mutates drop.status; combine with field patch.

        # Validate combined window if both bounds present after merge.
        candidate_start = patch.get("slot_window_start", drop.slot_window_start)
        candidate_end = patch.get("slot_window_end", drop.slot_window_end)
        if candidate_start >= candidate_end:
            raise DropServiceError("slot_window_start must be before slot_window_end")

        # A status-only change still goes through the repo so it is flushed
        # and the slots are reloaded for the response.
        return await drop_repo.update_drop(db, drop, patch)


async def delete_drop(drop_id: uuid.UUID) -> None:
    async with unit_of_work() as db:
        drop = await get_drop_or_404(db, drop_id)
        if drop.status != "planning":
            raise DropNotDeletableError(
                f"Cannot delete a drop in '{drop.status}' -- only planning drops "
                f"can be deleted.",
            )
        await drop_repo.delete_drop(db, drop)


async def _transition_status(
    db: AsyncSession, drop: Drop, new_status: str,
) -> None:
    if new_status not in DROP_STATUSES:
        raise InvalidStatusTransitionError(f"Unknown status: {new_status}")
    pair = (drop.status, new_status)
    if pair not in _ALLOWED_TRANSITIONS:
        raise InvalidStatusTransitionError(
            f"Cannot transition from '{drop.status}' to '{new_status}'",
        )
    if pair == ("planning", "active"):
        slot_count = await drop_repo.count_slots_for_drop(db, drop.id)
        if slot_count == 0:
            raise SlotRequiredError(
                "Cannot activate a drop with no slots. Add at least one slot first.",
            )
    drop.status = new_status


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------

async def add_slot(drop_id: uuid.UUID, body: SlotCreate) -> Slot:
    async with unit_of_work() as db:
        drop = await get_drop_or_404(db, drop_id)
        _ensure_slots_mutable(drop)
        return await drop_repo.create_slot(db, drop.id, body.model_dump())


async def update_slot(
    drop_id: uuid.UUID, slot_id: uuid.UUID, body: SlotUpdate,
) -> Slot:
    patch = body.model_dump(exclude_unset=True)
    async with unit_of_work() as db:
        drop = await get_drop_or_404(db, drop_id)
        slot = await _get_slot_in_drop(db, drop, slot_id)
        _ensure_slots_mutable(drop)
        if not patch:
            return slot
        return await drop_repo.update_slot(db, slot, patch)


async def remove_slot(drop_id: uuid.UUID, slot_id: uuid.UUID) -> None:
    async with unit_of_work() as db:
        drop = await get_drop_or_404(db, drop_id)
        slot = await _get_slot_in_drop(db, drop, slot_id)
        _ensure_slots_mutable(drop)
        await drop_repo.delete_slot(db, slot)


async def _get_slot_in_drop(
    db: AsyncSession, drop: Drop, slot_id: uuid.UUID,
) -> Slot:
    slot = await drop_repo.get_slot(db, slot_id)
    if slot is None:
        raise SlotNotFoundError(f"Slot {slot_id} not found")
    if slot.drop_id != drop.id:
        raise SlotNotFoundError(f"Slot {slot_id} not under drop {drop.id}")
    return slot


def _ensure_slots_mutable(drop: Drop) -> None:
    if drop.status == "closed":
        raise SlotEditingClosedError(
            "Cannot modify slots on a closed drop.",
        )
