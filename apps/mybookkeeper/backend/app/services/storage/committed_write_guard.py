"""Keeps storage and the database consistent around a write that points at new objects.

Objects are uploaded before the rows that reference them. Wrap the transaction::

    async with CommittedWriteGuard(new_keys, rows_present) as guard:
        async with unit_of_work() as db:
            ... write rows ...
            guard.set_superseded(keys_no_longer_referenced)
            guard.rows_written()      # last statement in the block

``rows_written()`` lets the guard tell a failure in the body (rolled back) from
a failure at COMMIT (outcome unknown). ``rows_present`` runs in a fresh session
and says whether the new rows are visible.

* Body failed: the new objects are removed.
* COMMIT failed: ``rows_present`` decides. Present means the write succeeded
  after all, so the error is swallowed. Absent means the new objects are
  removed. If the check fails too, the objects are kept and the problem logged,
  since deleting an object a committed row points at is worse than leaving an
  unreferenced one.
* ``rows_present`` must wait for the original transaction (take the same row
  lock, bounded by a lock timeout), or a plain read can run before an in-flight
  COMMIT is visible and wrongly report "absent". A write with no existing row to
  lock (creating a template) passes ``absence_conclusive=False``: "absent" then
  counts as unknown and the objects are kept.
* Once the commit is confirmed, the superseded objects are removed, even when
  the request was cancelled meanwhile.

Cleanup runs shielded so a cancelled request still finishes it.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from types import TracebackType

from app.services.storage.stored_file_cleanup import delete_stored_files

logger = logging.getLogger(__name__)

RowsPresent = Callable[[], Awaitable[bool]]


class CommittedWriteGuard:
    def __init__(
        self,
        new_keys: list[str],
        rows_present: RowsPresent,
        *,
        absence_conclusive: bool = True,
    ) -> None:
        self._new_keys = new_keys
        self._rows_present = rows_present
        self._absence_conclusive = absence_conclusive
        self._superseded: list[str] = []
        self._rows_written = False

    async def __aenter__(self) -> CommittedWriteGuard:
        return self

    def set_superseded(self, keys: list[str]) -> None:
        self._superseded = keys

    def rows_written(self) -> None:
        self._rows_written = True

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> bool:
        committed = True if exc is None else await asyncio.shield(self._resolve_outcome())
        if committed:
            await asyncio.shield(delete_stored_files(self._superseded))
        if exc is None:
            return False
        if committed and isinstance(exc, Exception):
            logger.warning("Commit raised %r but the rows are present; treating as committed", exc)
            return True
        if committed:
            logger.warning(
                "Request interrupted after the write committed; superseded objects %s were removed",
                self._superseded,
            )
        return False

    async def _resolve_outcome(self) -> bool | None:
        """True committed, False not committed (new objects removed), None unknown (kept)."""
        if self._rows_written:
            try:
                if await self._rows_present():
                    return True
                if not self._absence_conclusive:
                    logger.error(
                        "Write not visible after a commit-phase error, but absence cannot be "
                        "confirmed; keeping uploaded objects %s, which may be unreferenced",
                        self._new_keys,
                    )
                    return None
            except Exception:  # noqa: BLE001
                logger.error(
                    "Could not confirm whether the write committed; keeping uploaded "
                    "objects %s, which may be unreferenced",
                    self._new_keys, exc_info=True,
                )
                return None
        await delete_stored_files(self._new_keys)
        return False
