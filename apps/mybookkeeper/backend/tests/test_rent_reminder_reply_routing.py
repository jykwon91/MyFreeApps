"""Choosing whose reply a tenant's text is, from the reminder texts sent to its number."""
from __future__ import annotations

import dataclasses
import datetime as _dt
import random
import uuid

from app.core.rent_reminder_constants import REPLY_AMBIGUITY_HOURS
from app.repositories.rent.rent_reminder_reply_candidate import ReplyCandidate
from app.services.rent.rent_reminder_reply_routing import choose_reply_target

UTC = _dt.timezone.utc
NOW = _dt.datetime(2026, 11, 20, 18, 0, tzinfo=UTC)
ORG_A, USER_A = uuid.uuid4(), uuid.uuid4()
ORG_B, USER_B = uuid.uuid4(), uuid.uuid4()


def _text(
    *,
    org: uuid.UUID = ORG_A,
    user: uuid.UUID = USER_A,
    applicant: uuid.UUID | None = None,
    hours_ago: float = 0,
    due: _dt.date = _dt.date(2026, 11, 22),
    send_id: uuid.UUID | None = None,
    blocked: bool = False,
) -> ReplyCandidate:
    return ReplyCandidate(
        send_id=send_id or uuid.uuid4(),
        applicant_id=applicant or uuid.uuid4(),
        organization_id=org,
        user_id=user,
        due_date=due,
        created_at=NOW - _dt.timedelta(hours=hours_ago),
        blocked_by_stop=blocked,
    )


def test_no_texts_means_nobody() -> None:
    assert choose_reply_target([]) is None


def test_one_text_goes_to_its_account() -> None:
    text = _text()
    target = choose_reply_target([text])
    assert target is not None
    assert (target.organization_id, target.user_id, target.texts) == (ORG_A, USER_A, (text,))


def test_the_newest_text_wins_when_the_accounts_texted_days_apart() -> None:
    older = _text(org=ORG_A, user=USER_A, hours_ago=72)
    newer = _text(org=ORG_B, user=USER_B, hours_ago=1)
    target = choose_reply_target([older, newer])
    assert target is not None
    assert (target.organization_id, target.user_id, target.texts) == (ORG_B, USER_B, (newer,))


def test_two_accounts_texting_within_a_day_of_each_other_is_too_close_to_tell() -> None:
    assert choose_reply_target([
        _text(org=ORG_A, user=USER_A, hours_ago=REPLY_AMBIGUITY_HOURS - 0.5),
        _text(org=ORG_B, user=USER_B, hours_ago=0),
    ]) is None


def test_exactly_a_day_apart_is_not_too_close() -> None:
    newer = _text(org=ORG_B, user=USER_B, hours_ago=0)
    target = choose_reply_target([_text(hours_ago=REPLY_AMBIGUITY_HOURS), newer])
    assert target is not None and target.texts == (newer,)


def test_the_same_user_in_another_workspace_is_another_account() -> None:
    assert choose_reply_target([
        _text(org=ORG_A, user=USER_A, hours_ago=2),
        _text(org=ORG_B, user=USER_A, hours_ago=0),
    ]) is None


def test_another_member_of_the_same_workspace_is_another_account() -> None:
    assert choose_reply_target([
        _text(org=ORG_A, user=USER_A, hours_ago=2),
        _text(org=ORG_A, user=USER_B, hours_ago=0),
    ]) is None


def test_a_close_text_from_another_account_counts_even_behind_the_accounts_own() -> None:
    assert choose_reply_target([
        _text(org=ORG_A, user=USER_A, hours_ago=0),
        _text(org=ORG_A, user=USER_A, hours_ago=1),
        _text(org=ORG_B, user=USER_B, hours_ago=2),
    ]) is None


def test_each_of_the_accounts_tenants_on_the_number_comes_once_with_their_newest_text() -> None:
    sonu, ravi, other_landlords = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    sonu_newest = _text(applicant=sonu, hours_ago=0, due=_dt.date(2026, 11, 22))
    ravi_newest = _text(applicant=ravi, hours_ago=30, due=_dt.date(2026, 11, 15))
    candidates = [
        _text(applicant=ravi, hours_ago=400, due=_dt.date(2026, 11, 1)),
        sonu_newest,
        _text(applicant=sonu, hours_ago=200, due=_dt.date(2026, 11, 8)),
        _text(org=ORG_B, user=USER_B, applicant=other_landlords, hours_ago=100),
        ravi_newest,
    ]
    target = choose_reply_target(candidates)
    assert target is not None
    assert target.texts == (sonu_newest, ravi_newest)


def test_the_order_the_texts_arrive_in_does_not_matter() -> None:
    newest = _text(hours_ago=0)
    candidates = [newest, *[_text(hours_ago=hours) for hours in (5, 40, 90)]]
    random.Random(7).shuffle(candidates)
    target = choose_reply_target(candidates)
    assert target is not None and target.texts[0] == newest


def test_naive_times_from_sqlite_are_read_as_utc() -> None:
    aware = _text(org=ORG_A, user=USER_A, hours_ago=1)
    naive = _text(org=ORG_B, user=USER_B, hours_ago=0)
    naive = dataclasses.replace(naive, created_at=naive.created_at.replace(tzinfo=None))
    assert choose_reply_target([aware, naive]) is None


def test_texts_claimed_at_the_same_moment_are_ordered_by_id() -> None:
    low, high = sorted((uuid.uuid4(), uuid.uuid4()))
    target = choose_reply_target([_text(send_id=low), _text(send_id=high)])
    assert target is not None and target.texts[0].send_id == high


class TestTextsTwilioBlockedAfterAStop:
    """Every account texts from the same number, so a STOP sent in answer to
    one landlord blocks the others too: a blocked text never reached the tenant."""

    def test_never_outweigh_a_text_that_reached_the_number(self) -> None:
        reached = _text(org=ORG_B, user=USER_B, hours_ago=24 * 4)
        target = choose_reply_target([reached, _text(org=ORG_A, user=USER_A, hours_ago=1, blocked=True)])
        assert target is not None
        assert (target.organization_id, target.user_id, target.texts) == (ORG_B, USER_B, (reached,))

    def test_dont_make_a_close_text_that_reached_the_number_ambiguous(self) -> None:
        reached = _text(org=ORG_B, user=USER_B, hours_ago=2)
        target = choose_reply_target([reached, _text(org=ORG_A, user=USER_A, hours_ago=1, blocked=True)])
        assert target is not None and target.texts == (reached,)

    def test_the_accounts_own_text_that_reached_the_tenant_is_named_over_a_newer_blocked_one(self) -> None:
        reached = _text(hours_ago=24 * 20, due=_dt.date(2026, 11, 1))
        target = choose_reply_target([reached, _text(hours_ago=1, blocked=True)])
        assert target is not None and target.texts == (reached,)

    def test_still_reach_their_account_when_nothing_else_is_left(self) -> None:
        """After a STOP every later text is blocked, and the tenant's START must still get to that landlord."""
        newest = _text(hours_ago=1, blocked=True)
        target = choose_reply_target([_text(hours_ago=24 * 30, blocked=True), newest])
        assert target is not None
        assert (target.organization_id, target.user_id, target.texts[0]) == (ORG_A, USER_A, newest)

    def test_from_two_accounts_go_to_nobody_however_far_apart(self) -> None:
        assert choose_reply_target([
            _text(org=ORG_A, user=USER_A, hours_ago=24 * 30, blocked=True),
            _text(org=ORG_B, user=USER_B, hours_ago=1, blocked=True),
        ]) is None
