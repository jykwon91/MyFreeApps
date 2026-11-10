"""Every part of a scheduler tick contains its own failure.

One org's Gmail, the channel-iCal poll, lease auto-end, the utility-plan
check and the rent reminders each log what went wrong and never skip the
parts after them — a single bad mailbox or DB blip must not cost every other
org its sync or a tenant their reminder.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.integrations.gmail_sync_target import GmailSyncTarget
from app.workers import scheduler_worker

_WORKER = "app.workers.scheduler_worker"


def _target() -> GmailSyncTarget:
    return MagicMock(spec=GmailSyncTarget, organization_id=uuid.uuid4(), user_id=uuid.uuid4())


@contextmanager
def _cycle(
    *,
    targets: AsyncMock | None = None,
    gmail: AsyncMock | None = None,
    channels: AsyncMock | None = None,
    leases: AsyncMock | None = None,
    plans: AsyncMock | None = None,
) -> Iterator[dict[str, AsyncMock]]:
    mocks = {
        "targets": targets or AsyncMock(return_value=[]),
        "gmail": gmail or AsyncMock(),
        "channels": channels or AsyncMock(return_value=0),
        "leases": leases or AsyncMock(return_value=[]),
        "plans": plans or AsyncMock(return_value=[]),
    }
    with (
        patch(f"{_WORKER}.get_gmail_sync_targets", mocks["targets"]),
        patch(f"{_WORKER}.sync_gmail_connection", mocks["gmail"]),
        patch(f"{_WORKER}.poll_all_channels", mocks["channels"]),
        patch(
            f"{_WORKER}.signed_lease_repo.list_replaced_by_successor_starting_on_or_before",
            mocks["leases"],
        ),
        patch(f"{_WORKER}.unit_of_work", _fake_uow),
        patch(f"{_WORKER}.utility_plan_service.sweep_plans_needing_renewal", mocks["plans"]),
    ):
        yield mocks


class _FakeUow:
    async def __aenter__(self) -> MagicMock:
        return MagicMock()

    async def __aexit__(self, *_exc: object) -> None:
        return None


def _fake_uow() -> _FakeUow:
    return _FakeUow()


def _assert_later_steps_ran(mocks: dict[str, AsyncMock]) -> None:
    mocks["channels"].assert_awaited_once()
    mocks["leases"].assert_awaited_once()
    mocks["plans"].assert_awaited_once()


async def test_one_orgs_gmail_failure_does_not_skip_other_orgs_or_steps(
    caplog: pytest.LogCaptureFixture,
) -> None:
    first, second = _target(), _target()
    gmail = AsyncMock(side_effect=[RuntimeError("mailbox broke"), None])
    with _cycle(targets=AsyncMock(return_value=[first, second]), gmail=gmail) as mocks:
        await scheduler_worker.run_sync_cycle()
    assert [c.args[0] for c in gmail.await_args_list] == [first, second]
    _assert_later_steps_ran(mocks)
    assert f"Gmail sync failed for org {first.organization_id}" in caplog.text


async def test_listing_gmail_targets_failing_still_runs_the_other_steps() -> None:
    with _cycle(targets=AsyncMock(side_effect=ConnectionError("db down"))) as mocks:
        await scheduler_worker.run_sync_cycle()
    mocks["gmail"].assert_not_awaited()
    _assert_later_steps_ran(mocks)


async def test_channel_ical_failure_still_runs_leases_and_plans() -> None:
    with _cycle(channels=AsyncMock(side_effect=RuntimeError("feed down"))) as mocks:
        await scheduler_worker.run_sync_cycle()
    _assert_later_steps_ran(mocks)


async def test_lease_auto_end_failure_still_runs_the_plan_check() -> None:
    with _cycle(leases=AsyncMock(side_effect=RuntimeError("db blip"))) as mocks:
        await scheduler_worker.run_sync_cycle()
    _assert_later_steps_ran(mocks)


async def test_utility_plan_failure_is_contained() -> None:
    with _cycle(plans=AsyncMock(side_effect=RuntimeError("db blip"))) as mocks:
        await scheduler_worker.run_sync_cycle()
    _assert_later_steps_ran(mocks)


async def test_reminders_still_run_after_every_cycle_step_failed() -> None:
    reminders = AsyncMock()
    failing = AsyncMock(side_effect=RuntimeError("down"))
    with (
        _cycle(targets=failing, channels=failing, leases=failing, plans=failing),
        patch(f"{_WORKER}.rent_reminder_dispatch_service.run_tick", reminders),
    ):
        await scheduler_worker.run_tick(full_cycle=True, transparency_sync=False)
    reminders.assert_awaited_once()


async def test_a_reminder_failure_is_logged_not_raised(caplog: pytest.LogCaptureFixture) -> None:
    with patch(
        f"{_WORKER}.rent_reminder_dispatch_service.run_tick",
        AsyncMock(side_effect=RuntimeError("sms down")),
    ):
        await scheduler_worker.send_due_rent_reminders()
    assert "Rent reminder tick failed" in caplog.text
