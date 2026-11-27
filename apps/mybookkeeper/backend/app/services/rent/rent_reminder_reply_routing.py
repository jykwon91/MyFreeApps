"""Decide whose reply a tenant's text is, from the reminder texts sent to its number.

Pure. The account (organization and user) whose text to the number is newest
gets the reply: a reply answers the last message the tenant got. When a
different account texted the same number within ``REPLY_AMBIGUITY_HOURS`` of
that, the reply could be answering either, and emailing a tenant's words to
the wrong landlord is worse than not passing them on, so nobody gets it.

A text Twilio blocked because the tenant had texted STOP never reached them.
Every account texts from the same number, so one landlord's STOP blocks every
other landlord's texts to that tenant too. Blocked texts therefore never
outweigh a text that may have arrived. When they are all that's left, they
decide only if they are all one account's, so that landlord's tenant texting
START still reaches them.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Sequence

from app.core.datetime_utils import as_utc
from app.core.rent_reminder_constants import REPLY_AMBIGUITY_HOURS
from app.repositories.rent.rent_reminder_reply_candidate import ReplyCandidate
from app.services.rent.rent_reminder_reply_target import ReplyTarget

_AMBIGUITY_WINDOW = _dt.timedelta(hours=REPLY_AMBIGUITY_HOURS)


def _newest_first_key(candidate: ReplyCandidate) -> tuple[_dt.datetime, uuid.UUID]:
    return as_utc(candidate.created_at), candidate.send_id


def _account(candidate: ReplyCandidate) -> tuple[uuid.UUID, uuid.UUID]:
    return candidate.organization_id, candidate.user_id


def choose_reply_target(candidates: Sequence[ReplyCandidate]) -> ReplyTarget | None:
    """The account to forward the reply to, or ``None`` when there's none or it can't be told.

    Only texts that may have reached the tenant decide, unless Twilio blocked
    all of them and they are one account's. Each of the account's tenants
    among the deciding texts comes with their own newest text, so whichever of
    them the email names, it names that tenant's due date.
    """
    may_have_arrived = [candidate for candidate in candidates if not candidate.blocked_by_stop]
    if may_have_arrived:
        return _newest_account(may_have_arrived)
    if len({_account(candidate) for candidate in candidates}) == 1:
        return _newest_account(candidates)
    return None


def _newest_account(candidates: Sequence[ReplyCandidate]) -> ReplyTarget | None:
    """The account with the newest of ``candidates`` (never empty), unless another one is too close."""
    ordered = sorted(candidates, key=_newest_first_key, reverse=True)
    newest = ordered[0]
    newest_at = as_utc(newest.created_at)
    texts: list[ReplyCandidate] = []
    for candidate in ordered:
        if _account(candidate) != _account(newest):
            if newest_at - as_utc(candidate.created_at) < _AMBIGUITY_WINDOW:
                return None
        elif all(text.applicant_id != candidate.applicant_id for text in texts):
            texts.append(candidate)
    return ReplyTarget(
        organization_id=newest.organization_id, user_id=newest.user_id, texts=tuple(texts),
    )
