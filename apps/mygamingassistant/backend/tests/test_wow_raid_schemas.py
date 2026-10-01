"""Unit tests for app.schemas.wow.raid Pydantic schemas.

Pure validation tests — no DB, no async.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.wow.wow_raid_event import RAID_KEYS
from app.models.wow.wow_raid_signup import WOW_CLASSES
from app.schemas.wow.raid import (
    MemberPrefUpsert,
    RaidEventCreate,
    RaidGuildSettings,
    RaidGuildUpsert,
    RaidSignupUpsert,
)
from app.services.wow.raid_roster import REQUESTABLE_STATUSES


# ---------------------------------------------------------------------------
# RaidGuildSettings
# ---------------------------------------------------------------------------


def test_default_settings_valid():
    s = RaidGuildSettings()
    assert s.nudge_offsets_minutes == [2880, 1440]
    assert s.consumables_reminder_minutes == 1440
    assert s.ready_check_minutes == 60


def test_custom_settings_valid():
    s = RaidGuildSettings(
        nudge_offsets_minutes=[360, 60],
        consumables_reminder_minutes=120,
        ready_check_minutes=30,
    )
    assert s.nudge_offsets_minutes == [360, 60]


def test_negative_nudge_offset_rejected():
    with pytest.raises(ValidationError, match="non-negative"):
        RaidGuildSettings(nudge_offsets_minutes=[-10, 60])


def test_negative_consumables_rejected():
    with pytest.raises(ValidationError):
        RaidGuildSettings(consumables_reminder_minutes=-1)


def test_extra_field_rejected():
    with pytest.raises(ValidationError):
        RaidGuildSettings(unknown_field=123)


# ---------------------------------------------------------------------------
# RaidGuildUpsert
# ---------------------------------------------------------------------------


def test_upsert_all_defaults():
    g = RaidGuildUpsert()
    assert g.timezone == "UTC"
    assert g.settings is None


def test_upsert_with_settings():
    g = RaidGuildUpsert(settings=RaidGuildSettings(ready_check_minutes=30))
    assert g.settings.ready_check_minutes == 30


# ---------------------------------------------------------------------------
# RaidEventCreate
# ---------------------------------------------------------------------------


def test_valid_event_all_raid_keys():
    from datetime import datetime, timezone

    for key in RAID_KEYS:
        e = RaidEventCreate(
            raid_key=key,
            starts_at=datetime(2026, 12, 9, 20, 0, 0, tzinfo=timezone.utc),
            channel_id="123456789012345678",
            created_by_user_id="987654321098765432",
        )
        assert e.raid_key == key


def test_invalid_raid_key_rejected():
    from datetime import datetime, timezone

    with pytest.raises(ValidationError, match="raid_key"):
        RaidEventCreate(
            raid_key="unknown_dungeon",
            starts_at=datetime(2026, 12, 9, 20, 0, 0, tzinfo=timezone.utc),
            channel_id="123456789012345678",
            created_by_user_id="987654321098765432",
        )


def test_size_cap_bounds():
    from datetime import datetime, timezone

    base = dict(
        raid_key="mc",
        starts_at=datetime(2026, 12, 9, 20, 0, 0, tzinfo=timezone.utc),
        channel_id="123456789012345678",
        created_by_user_id="987654321098765432",
    )
    # Valid bounds
    RaidEventCreate(**base, size_cap=1)
    RaidEventCreate(**base, size_cap=40)
    # Invalid
    with pytest.raises(ValidationError):
        RaidEventCreate(**base, size_cap=0)
    with pytest.raises(ValidationError):
        RaidEventCreate(**base, size_cap=41)


# ---------------------------------------------------------------------------
# RaidSignupUpsert
# ---------------------------------------------------------------------------


def test_valid_signup():
    s = RaidSignupUpsert(
        discord_user_id="123456789012345678",
        display_name="Legolas",
        status="confirmed",
        wow_class="hunter",
        role="dps",
    )
    assert s.status == "confirmed"
    assert s.wow_class == "hunter"


def test_all_valid_wow_classes():
    for cls in WOW_CLASSES:
        s = RaidSignupUpsert(
            discord_user_id="1",
            display_name="X",
            status="confirmed",
            wow_class=cls,
            role="dps",
        )
        assert s.wow_class == cls


def test_all_valid_statuses():
    for status in REQUESTABLE_STATUSES:
        s = RaidSignupUpsert(
            discord_user_id="1",
            display_name="X",
            status=status,
        )
        assert s.status == status


def test_invalid_status_rejected():
    with pytest.raises(ValidationError, match="status"):
        RaidSignupUpsert(
            discord_user_id="1",
            display_name="X",
            status="afk",
        )


def test_queued_is_assigned_by_the_bot_never_requested():
    with pytest.raises(ValidationError, match="status"):
        RaidSignupUpsert(discord_user_id="1", display_name="X", status="queued")


def test_invalid_class_rejected():
    with pytest.raises(ValidationError, match="wow_class"):
        RaidSignupUpsert(
            discord_user_id="1",
            display_name="X",
            status="confirmed",
            wow_class="deathknight",  # not in Classic Era
        )


def test_invalid_role_rejected():
    with pytest.raises(ValidationError, match="role"):
        RaidSignupUpsert(
            discord_user_id="1",
            display_name="X",
            status="confirmed",
            role="support",
        )


def test_spec_must_belong_to_the_class():
    s = RaidSignupUpsert(discord_user_id="1", display_name="X", status="confirmed", wow_class="druid", spec="feral-tank")
    assert s.spec == "feral-tank"
    with pytest.raises(ValidationError, match="not a mage spec"):
        RaidSignupUpsert(discord_user_id="1", display_name="X", status="confirmed", wow_class="mage", spec="holy")
    with pytest.raises(ValidationError, match="spec must be one of"):
        RaidSignupUpsert(discord_user_id="1", display_name="X", status="confirmed", spec="frost-dk")


def test_null_class_and_role_allowed():
    """Players can sign up before selecting class/role."""
    s = RaidSignupUpsert(
        discord_user_id="1",
        display_name="X",
        status="tentative",
        wow_class=None,
        role=None,
    )
    assert s.wow_class is None
    assert s.role is None


# ---------------------------------------------------------------------------
# MemberPrefUpsert
# ---------------------------------------------------------------------------


def test_valid_pref():
    p = MemberPrefUpsert(
        default_wow_class="priest",
        default_role="healer",
        dm_opt_out=False,
    )
    assert p.default_wow_class == "priest"


def test_pref_all_nulls_allowed():
    p = MemberPrefUpsert()
    assert p.default_wow_class is None
    assert p.default_role is None
    assert p.dm_opt_out is False


def test_invalid_class_in_pref_rejected():
    with pytest.raises(ValidationError, match="default_wow_class"):
        MemberPrefUpsert(default_wow_class="demon_hunter")


def test_invalid_role_in_pref_rejected():
    with pytest.raises(ValidationError, match="default_role"):
        MemberPrefUpsert(default_role="carry")


def test_saved_specs_are_per_class():
    p = MemberPrefUpsert(saved_specs={"warrior": "fury", "priest": "holy"})
    assert p.saved_specs == {"warrior": "fury", "priest": "holy"}
    assert MemberPrefUpsert().saved_specs == {}
    with pytest.raises(ValidationError, match="saved_specs keys"):
        MemberPrefUpsert(saved_specs={"necromancer": "fury"})
    with pytest.raises(ValidationError, match="not a warrior spec"):
        MemberPrefUpsert(saved_specs={"warrior": "holy"})
