"""Fail loud at boot when texts can go out but no sender account is set.

With ``SMS_BACKEND=twilio`` every allowed text really leaves the operator's
number, so ``SMS_SENDER_USER_ID`` must name the one account allowed to send
them. Unset, nobody could text, and every texting plan would fail each due
date. The console backend sends nothing, so it may leave the id unset, but a
value that is set must still be a valid id. The sender rule is MBK's alone, so
the guard lives here rather than in ``platform_shared``.

The API lifespan and the scheduler worker (which sends scheduled reminders)
both call it.
"""
from __future__ import annotations

from app.core.sms_sender import parse_sms_sender_user_id
from app.core.sms_sender_not_configured_error import SmsSenderNotConfiguredError

_SENDING_BACKEND = "twilio"


def check_sms_sender_configured(*, sms_backend: str, sms_sender_user_id: str) -> None:
    raw = sms_sender_user_id.strip()
    if raw and parse_sms_sender_user_id(raw) is None:
        raise SmsSenderNotConfiguredError(
            "SMS_SENDER_USER_ID is not a valid account id. Set it to the id of "
            "the one account allowed to send rent reminder texts.",
        )
    if sms_backend == _SENDING_BACKEND and not raw:
        raise SmsSenderNotConfiguredError(
            "SMS_BACKEND=twilio needs SMS_SENDER_USER_ID: the id of the one "
            "account allowed to send rent reminder texts. Set it in "
            "apps/mybookkeeper/backend/.env.docker, or set SMS_BACKEND=console.",
        )
