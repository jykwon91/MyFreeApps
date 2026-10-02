"""Unit tests for the rules Raid: Edit applies — raid_details and raid_colors.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.wow.raid_colors import COLORS_BY_KEY, DEFAULT_COLOR, RAID_COLORS, color_of, stored_value
from app.services.wow.raid_details import (
    DESCRIPTION_MAX,
    IMAGE_URL_MAX,
    REASON_MAX,
    TITLE_MAX,
    clean_description,
    clean_reason,
    clean_title,
    image_link,
    leader_id,
    leader_name,
    stored_title,
)
from app.services.wow.raid_embed import COLOR_CLOSED, COLOR_OPEN


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": datetime(2026, 10, 11, tzinfo=timezone.utc),
        "size_cap": 40,
        "status": "scheduled",
        "channel_id": "c1",
        "created_by_user_id": "u0",
        "created_by_display_name": "Thrall",
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


# ---------------------------------------------------------------------------
# Who leads
# ---------------------------------------------------------------------------


def test_the_creator_leads_until_the_raid_is_handed_over() -> None:
    event = _event()
    assert (leader_id(event), leader_name(event)) == ("u0", "Thrall")
    event.leader_user_id, event.leader_display_name = "u9", "Jaina"
    assert (leader_id(event), leader_name(event)) == ("u9", "Jaina")


def test_a_handed_over_leader_without_a_name_never_shows_the_creators() -> None:
    event = _event(leader_user_id="u9", leader_display_name=None)
    assert leader_id(event) == "u9"
    assert leader_name(event) is None


# ---------------------------------------------------------------------------
# Title, description, cancel reason
# ---------------------------------------------------------------------------


def test_a_title_is_one_line_of_single_spaces() -> None:
    assert clean_title("  Ony\n  speedrun\t run ") == "Ony speedrun run"
    assert clean_title("   ") == ""
    assert clean_title("x" * 100) == "x" * TITLE_MAX


def test_the_raids_own_name_is_stored_as_no_title() -> None:
    assert stored_title("onyxia", "Onyxia's Lair") is None
    assert stored_title("onyxia", "Ony speedrun") == "Ony speedrun"


def test_a_description_keeps_its_lines_and_clears_when_blank() -> None:
    assert clean_description("  Bring FR\n\nFlasks  \n") == "Bring FR\n\nFlasks"
    assert clean_description(" \n ") is None
    assert clean_description("x" * 900) == "x" * DESCRIPTION_MAX


def test_a_cancel_reason_is_one_line_or_none() -> None:
    assert clean_reason("  Not enough\nhealers ") == "Not enough healers"
    assert clean_reason("   ") is None
    assert clean_reason("x" * 300) == "x" * REASON_MAX


# ---------------------------------------------------------------------------
# Banner links
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "link",
    [
        "https://i.imgur.com/raid.png",
        "https://cdn.discordapp.com/attachments/1/2/banner.png?ex=66&is=67&hm=ab",
        "https://example.com/a/b%20c.webp",
        "https://sub-domain.example.co.uk/image#frag",
        "https://upload.wikimedia.org/wikipedia/commons/a/a5/Onyxia_(model).jpg",
        "https://example.com",
    ],
)
def test_https_image_links_are_kept(link: str) -> None:
    assert image_link(f"  {link} ") == link


@pytest.mark.parametrize(
    "link",
    [
        "http://i.imgur.com/raid.png",  # Discord wants https for embed images
        "ftp://example.com/a.png",
        "i.imgur.com/raid.png",
        "https://localhost/a.png",  # no dotted host name
        "https://127.0.0.1/a.png",
        "https://-bad.example.com/a.png",
        "https://example.com:8443/a.png",  # image hosts don't need a port
        "https://example.com:99999/a.png",
        "https://example.com/a[1].png",  # brackets must be %-encoded
        "https://example.com/a%zz.png",  # not a %-encoding
        "https://example.com/a b.png",
        "https://example.com/<script>",
        "https://example.com/\"q\"",
        "javascript:alert(1)",
        "https://example.com/" + "a" * IMAGE_URL_MAX,
    ],
)
def test_anything_discord_might_refuse_is_turned_away(link: str) -> None:
    with pytest.raises(ValueError):
        image_link(link)


def test_a_blank_link_goes_back_to_the_raids_banner() -> None:
    assert image_link("   ") is None


# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------


def test_six_distinct_colors_purple_first_and_never_the_closed_grey() -> None:
    assert len(RAID_COLORS) == 6
    assert RAID_COLORS[0] == DEFAULT_COLOR and DEFAULT_COLOR.value == COLOR_OPEN
    assert len({color.key for color in RAID_COLORS}) == 6
    assert len({color.value for color in RAID_COLORS}) == 6
    assert len({color.swatch for color in RAID_COLORS}) == 6
    assert COLOR_CLOSED not in {color.value for color in RAID_COLORS}
    for color in RAID_COLORS:
        assert 0 <= color.value <= 0xFFFFFF  # ck_wowraidevent_color
        assert COLORS_BY_KEY[color.key] == color
        assert 1 <= len(color.label) <= 100 and len(color.key) <= 100  # select option limits


def test_the_default_is_stored_as_null_and_read_back() -> None:
    assert stored_value(DEFAULT_COLOR) is None
    assert color_of(None) == DEFAULT_COLOR
    blue = COLORS_BY_KEY["blue"]
    assert stored_value(blue) == 0x3498DB
    assert color_of(0x3498DB) == blue
    assert color_of(0x123456) is None  # not one of the six
