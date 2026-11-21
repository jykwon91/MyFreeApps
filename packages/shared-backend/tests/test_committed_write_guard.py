"""CommittedWriteGuard: new objects removed on rollback, superseded ones only after a confirmed commit."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from platform_shared.services.storage.committed_write_guard import CommittedWriteGuard

DELETE = "platform_shared.services.storage.committed_write_guard.delete_stored_files"
STORAGE = MagicMock()


@pytest.mark.asyncio
async def test_clean_exit_deletes_only_superseded_keys() -> None:
    with patch(DELETE, new_callable=AsyncMock) as delete:
        async with CommittedWriteGuard(STORAGE, ["new"], AsyncMock(return_value=True)) as guard:
            guard.set_superseded(["old"])
            guard.rows_written()

    delete.assert_awaited_once_with(STORAGE, ["old"])


@pytest.mark.asyncio
async def test_body_failure_deletes_new_keys_and_keeps_superseded() -> None:
    with patch(DELETE, new_callable=AsyncMock) as delete:
        with pytest.raises(ValueError):
            async with CommittedWriteGuard(STORAGE, ["new"], AsyncMock(return_value=True)) as guard:
                guard.set_superseded(["old"])
                raise ValueError("body failed")

    delete.assert_awaited_once_with(STORAGE, ["new"])


@pytest.mark.asyncio
async def test_cancellation_after_landed_commit_still_deletes_superseded_keys() -> None:
    with patch(DELETE, new_callable=AsyncMock) as delete:
        with pytest.raises(asyncio.CancelledError):
            async with CommittedWriteGuard(STORAGE, ["new"], AsyncMock(return_value=True)) as guard:
                guard.set_superseded(["old"])
                guard.rows_written()
                raise asyncio.CancelledError

    delete.assert_awaited_once_with(STORAGE, ["old"])


@pytest.mark.asyncio
async def test_cancellation_before_rows_written_deletes_new_keys() -> None:
    with patch(DELETE, new_callable=AsyncMock) as delete:
        with pytest.raises(asyncio.CancelledError):
            async with CommittedWriteGuard(STORAGE, ["new"], AsyncMock(return_value=True)) as guard:
                guard.set_superseded(["old"])
                raise asyncio.CancelledError

    delete.assert_awaited_once_with(STORAGE, ["new"])


@pytest.mark.asyncio
async def test_inconclusive_absence_after_commit_phase_error_keeps_new_keys() -> None:
    with patch(DELETE, new_callable=AsyncMock) as delete:
        with pytest.raises(RuntimeError):
            async with CommittedWriteGuard(
                STORAGE, ["new"], AsyncMock(return_value=False), absence_conclusive=False,
            ) as guard:
                guard.rows_written()
                raise RuntimeError("commit failed")

    delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_present_rows_after_commit_phase_error_succeed_even_when_absence_is_inconclusive() -> None:
    with patch(DELETE, new_callable=AsyncMock) as delete:
        async with CommittedWriteGuard(
            STORAGE, ["new"], AsyncMock(return_value=True), absence_conclusive=False,
        ) as guard:
            guard.set_superseded(["old"])
            guard.rows_written()
            raise RuntimeError("connection lost after commit")

    delete.assert_awaited_once_with(STORAGE, ["old"])


@pytest.mark.asyncio
async def test_failed_outcome_check_keeps_new_keys() -> None:
    with patch(DELETE, new_callable=AsyncMock) as delete:
        with pytest.raises(RuntimeError):
            async with CommittedWriteGuard(STORAGE, ["new"], AsyncMock(side_effect=TimeoutError)) as guard:
                guard.set_superseded(["old"])
                guard.rows_written()
                raise RuntimeError("commit failed")

    delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_repeated_cancel_does_not_cut_the_cleanup_short() -> None:
    gate = asyncio.Event()
    deleted: list[list[str]] = []

    async def slow_delete(_storage: object, keys: list[str]) -> None:
        await gate.wait()
        deleted.append(keys)

    async def write() -> None:
        async with CommittedWriteGuard(STORAGE, ["new"], AsyncMock(return_value=True)):
            raise asyncio.CancelledError

    with patch(DELETE, slow_delete):
        task = asyncio.create_task(write())
        await asyncio.sleep(0.01)
        task.cancel()
        await asyncio.sleep(0.01)
        task.cancel()
        await asyncio.sleep(0.01)
        assert not task.done()
        gate.set()
        with pytest.raises(asyncio.CancelledError):
            await task

    assert deleted == [["new"]]
