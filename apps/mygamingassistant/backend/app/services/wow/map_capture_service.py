"""World Map captures — store, list, and publish what the MGA Companion addon
recorded in WoW Forever.

Two ways in:

* **Operator import** (``POST /api/wow/map-captures``, full-auth mode): the
  browser parses the addon's SavedVariables, classifies each record and sends
  them here. Upsert by ``capture_key``; a record only replaces the stored one
  when it was captured later, so re-importing an old file never rolls a
  position back.
* **Pack import** (``python -m app.cli import-wow-captures``, every deploy):
  the serve-only production site has no login, so captures reach it through
  the committed pack ``backend/data/wow_map_captures.json``, written locally by
  ``python -m app.cli export-wow-captures``. The pack is a complete snapshot —
  prod mirrors it exactly, and captures missing from it are deleted (an empty
  pack is treated as a broken export and deletes nothing).
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.map_capture import WowMapCapture
from app.repositories.wow import map_capture_repo
from app.schemas.wow.map_capture import (
    MapCaptureImportRequest,
    MapCaptureImportResult,
    MapCaptureList,
    MapCaptureRead,
    MapCaptureWrite,
)

logger = logging.getLogger(__name__)

PACK_VERSION = 1
# Baked into the image with the rest of backend/ (``COPY .../backend/ /app/``):
#   .../app/services/wow/map_capture_service.py → parents[3] = backend root.
DEFAULT_PACK_PATH = Path(__file__).resolve().parents[3] / "data" / "wow_map_captures.json"


class CapturePackError(Exception):
    """The pack is unusable (wrong version or an invalid record). Aborts the
    whole import so prod never ends up with half a pack."""


@dataclass
class PackImportStats:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    deleted: int = 0

    def summary(self) -> str:
        return (
            f"World Map captures: {self.created} created, {self.updated} updated, "
            f"{self.unchanged} unchanged, {self.deleted} deleted"
        )


def _values(capture: MapCaptureWrite) -> dict[str, Any]:
    return capture.model_dump(mode="python")


def _latest_by_key(captures: list[MapCaptureWrite]) -> dict[str, MapCaptureWrite]:
    latest: dict[str, MapCaptureWrite] = {}
    for capture in captures:
        seen = latest.get(capture.capture_key)
        if seen is None or capture.captured_at > seen.captured_at:
            latest[capture.capture_key] = capture
    return latest


async def _upsert(
    db: AsyncSession, captures: list[MapCaptureWrite], *, newer_only: bool
) -> tuple[int, int, int]:
    """Insert or update each capture by key. Returns (created, updated, unchanged)."""
    incoming = _latest_by_key(captures)
    existing = await map_capture_repo.by_keys(db, incoming.keys())
    created = updated = unchanged = 0
    for key, capture in incoming.items():
        row = existing.get(key)
        values = _values(capture)
        if row is None:
            map_capture_repo.add(db, values)
            created += 1
        elif _is_same(row, values) or (newer_only and capture.captured_at <= row.captured_at):
            unchanged += 1
        else:
            for field, value in values.items():
                setattr(row, field, value)
            updated += 1
    await db.flush()
    return created, updated, unchanged


def _is_same(row: WowMapCapture, values: dict[str, Any]) -> bool:
    return all(getattr(row, field) == value for field, value in values.items())


async def list_captures(db: AsyncSession) -> MapCaptureList:
    rows = await map_capture_repo.list_all(db)
    return MapCaptureList(captures=[MapCaptureRead.model_validate(row) for row in rows])


async def import_captures(payload: MapCaptureImportRequest) -> MapCaptureImportResult:
    async with unit_of_work() as db:
        created, updated, unchanged = await _upsert(db, payload.captures, newer_only=True)
    logger.info("World Map capture import: created=%d updated=%d unchanged=%d", created, updated, unchanged)
    return MapCaptureImportResult(created=created, updated=updated, unchanged=unchanged)


# ---------------------------------------------------------------------------
# Pack export / import
# ---------------------------------------------------------------------------


def _pack_record(row: WowMapCapture) -> dict[str, Any]:
    return MapCaptureRead.model_validate(row).model_dump(mode="json", exclude_none=True)


async def export_pack(path: Path | None = None) -> int:
    """Write every stored capture to the pack. Returns the number written."""
    async with unit_of_work() as db:
        rows = await map_capture_repo.list_all(db)
    records = sorted((_pack_record(row) for row in rows), key=lambda r: r["capture_key"])
    target = path or DEFAULT_PACK_PATH
    target.write_text(
        json.dumps({"version": PACK_VERSION, "captures": records}, indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return len(records)


def read_pack(path: Path | None = None) -> list[MapCaptureWrite]:
    raw = json.loads((path or DEFAULT_PACK_PATH).read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("version") != PACK_VERSION:
        raise CapturePackError(f"expected a version {PACK_VERSION} World Map capture pack")
    records = raw.get("captures")
    if not isinstance(records, list):
        raise CapturePackError("the pack has no captures list")
    try:
        return [MapCaptureWrite.model_validate(record) for record in records]
    except ValidationError as exc:
        raise CapturePackError(f"invalid capture in the pack: {exc}") from exc


async def import_pack(path: Path | None = None) -> PackImportStats:
    """Make the database match the pack exactly (one transaction)."""
    captures = read_pack(path)
    stats = PackImportStats()
    if not captures:
        # An empty pack is a broken export, not an instruction to wipe prod.
        logger.warning("World Map capture pack is empty — nothing imported or deleted")
        return stats
    async with unit_of_work() as db:
        stats.created, stats.updated, stats.unchanged = await _upsert(db, captures, newer_only=False)
        stats.deleted = await map_capture_repo.delete_except(db, {c.capture_key for c in captures})
    return stats
