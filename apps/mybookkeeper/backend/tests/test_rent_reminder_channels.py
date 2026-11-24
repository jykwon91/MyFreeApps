"""Each reminder channel is declared once, in ``RentReminderChannel``; its named
constants, the table's checks and the api-client's union are checked against it."""
import re
from pathlib import Path
from typing import get_args

from app.core.rent_reminder_channel import RentReminderChannel
from app.core.rent_reminder_enums import (
    RENT_REMINDER_CHANNEL_EMAIL,
    RENT_REMINDER_CHANNEL_SMS,
    RENT_REMINDER_CHANNELS,
)
from app.models.rent.rent_reminder_send import RentReminderSend
from app.schemas.rent.rent_reminder_send_now_request import RentReminderSendNowRequest

API_CLIENT_CHANNEL = Path(__file__).parents[2] / "api-client" / "src" / "types" / "rent" / "rent-reminder-channel.ts"


def _constraint(name: str) -> str:
    sql = next((str(c.sqltext) for c in RentReminderSend.__table__.constraints if c.name == name), None)
    assert sql is not None, f"rent_reminder_sends has no check named {name}; update this test if it was renamed."
    return sql


def test_the_named_channels_are_the_allowed_ones() -> None:
    assert RENT_REMINDER_CHANNELS == get_args(RentReminderChannel)
    assert (RENT_REMINDER_CHANNEL_EMAIL, RENT_REMINDER_CHANNEL_SMS) == RENT_REMINDER_CHANNELS


def test_the_table_checks_read_as_the_migration_wrote_them() -> None:
    assert _constraint("chk_rent_reminder_send_channel") == "channel IN ('email', 'sms')"
    assert _constraint("chk_rent_reminder_send_status_matches_channel") == (
        "channel = 'sms' OR status IN ('queued', 'sent', 'failed')"
    )


def test_send_now_takes_no_more_channels_than_there_are() -> None:
    fields = RentReminderSendNowRequest.model_json_schema()["properties"]
    assert fields["channels"]["maxItems"] == len(RENT_REMINDER_CHANNELS)
    assert fields["confirmed_possibly_sent"]["maxItems"] == len(RENT_REMINDER_CHANNELS)


def test_the_api_client_union_lists_the_same_channels() -> None:
    source = API_CLIENT_CHANNEL.read_text(encoding="utf-8")
    union = re.search(r"export type RentReminderChannel = ([^;]+);", source)
    assert union, (
        "rent-reminder-channel.ts no longer declares RentReminderChannel as a union "
        "of strings; update this test's parser so the channels are still compared."
    )
    assert set(re.findall(r'"([^"]+)"', union.group(1))) == set(RENT_REMINDER_CHANNELS)
