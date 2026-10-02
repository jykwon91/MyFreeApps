"""Pure tests for the raid notification builders (no DB, no network).

Copy is pinned to the UX spec's "Notifications" section.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from platform_shared.services.discord import MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS

from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_notifications
from app.services.wow.raid_composition import RoleGaps, expected_composition, role_gaps
from app.services.wow.raid_consumables import ConsumableChecklist, ConsumableItem
from app.services.wow.raid_embed import EMBED_TOTAL_BUDGET, FIELD_VALUE_LIMIT, embed_length
from app.services.wow.raid_roster import compute_roster_summary

_T = datetime(2026, 12, 9, 19, 0, tzinfo=timezone.utc)
_UNIX = 1_800_000_000
_LINK = "https://discord.com/channels/1/2/3"
_ROLE = "777"


def _seated(tanks: int, healers: int, dps: int, *, extra_status: str = "confirmed") -> list[WowRaidSignup]:
    rows: list[WowRaidSignup] = []
    for role, count in (("tank", tanks), ("healer", healers), ("dps", dps)):
        for i in range(count):
            rows.append(
                WowRaidSignup(
                    discord_user_id=f"{role}{i}", display_name=f"{role}{i}", wow_class="druid",
                    role=role, status=extra_status, signed_up_at=_T,
                )
            )
    return rows


def _nudge(seated: list[WowRaidSignup], *, size: int = 40, early: bool, role: str | None = _ROLE):
    summary = compute_roster_summary(seated, size_cap=size)
    return raid_notifications.build_signup_nudge(
        raid_label="Onyxia",
        starts_unix=_UNIX,
        summary=summary,
        gaps=role_gaps(size, summary.role_counts),
        early=early,
        ping_role_id=role,
        signup_link=_LINK,
    )


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------


def test_expected_composition_bands() -> None:
    forty = expected_composition(40)
    assert (forty.tanks, forty.healers, forty.dps) == (4, 10, 26)
    ten = expected_composition(10)
    assert (ten.tanks, ten.healers, ten.dps) == (2, 3, 5)
    tiny = expected_composition(1)
    assert (tiny.tanks, tiny.healers, tiny.dps) == (1, 0, 0)


def test_role_gaps_never_negative() -> None:
    summary = compute_roster_summary(_seated(6, 2, 0), size_cap=10)
    gaps = role_gaps(10, summary.role_counts)
    assert gaps == RoleGaps(tanks=0, healers=1, dps=5)


# ---------------------------------------------------------------------------
# Signup nudge
# ---------------------------------------------------------------------------


def test_nudge_copy_matches_spec_and_pings_at_48h() -> None:
    # 14 seated: 2 tanks, 4 healers, 8 DPS → short 2 tanks, 6 healers.
    payload = _nudge(_seated(2, 4, 8), early=True)
    assert payload is not None
    assert payload["content"] == (
        f"<@&{_ROLE}> **Onyxia is <t:{_UNIX}:R>.** 14 of 40 confirmed. "
        f"Still need: **2 tanks, 6 healers**. 26 spots open. [Sign up]({_LINK})"
    )
    assert payload["allowed_mentions"] == {"parse": [], "roles": [_ROLE]}
    assert "flags" not in payload


def test_nudge_skipped_when_full() -> None:
    assert _nudge(_seated(2, 3, 5), size=10, early=True) is None


def test_early_nudge_without_scarce_gap_is_silent() -> None:
    payload = _nudge(_seated(4, 10, 2), early=True)
    assert payload is not None
    assert "Still need" not in payload["content"]
    assert "<@&" not in payload["content"]
    assert payload["allowed_mentions"] == {"parse": []}
    assert payload["flags"] == MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS


def test_late_nudge_pings_only_under_70_percent() -> None:
    under = _nudge(_seated(4, 10, 13), early=False)  # 27/40 = 67.5%
    assert under is not None and under["allowed_mentions"]["roles"] == [_ROLE]

    over = _nudge(_seated(4, 10, 14), early=False)  # 28/40 = 70%
    assert over is not None
    assert over["allowed_mentions"] == {"parse": []}
    assert over["flags"] == MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS


def test_nudge_without_ping_role_is_silent_and_singular_copy() -> None:
    payload = _nudge(_seated(1, 3, 5), size=10, early=True, role=None)
    assert payload is not None
    assert "9 of 10 confirmed. Still need: **1 tank**. 1 spot open." in payload["content"]
    assert payload["flags"] == MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS
    assert payload["allowed_mentions"] == {"parse": []}


def test_late_signups_hold_seats_in_the_count() -> None:
    payload = _nudge(_seated(0, 0, 5, extra_status="late"), size=10, early=False)
    assert payload is not None
    assert "5 of 10 confirmed." in payload["content"]


# ---------------------------------------------------------------------------
# Mentions: ready check + DM fallback
# ---------------------------------------------------------------------------


def test_ready_check_mentions_users_not_roles() -> None:
    [payload] = raid_notifications.build_ready_check(raid_label="Onyxia", starts_unix=_UNIX, user_ids=["1", "2"])
    assert payload["content"] == f"**Ready check — Onyxia starts <t:{_UNIX}:R>.**\n<@1> <@2>"
    assert payload["allowed_mentions"] == {"parse": [], "users": ["1", "2"]}


def test_mentions_chunk_under_discord_limits() -> None:
    ids = [str(10**18 + i) for i in range(150)]
    payloads = raid_notifications.build_ready_check(raid_label="Onyxia", starts_unix=_UNIX, user_ids=ids)
    assert len(payloads) > 1
    seen: list[str] = []
    for payload in payloads:
        assert len(payload["content"]) <= raid_notifications.CONTENT_LIMIT
        assert len(payload["allowed_mentions"]["users"]) <= raid_notifications.MAX_MENTIONED_USERS
        assert payload["content"].startswith("**Ready check")
        seen.extend(payload["allowed_mentions"]["users"])
    assert seen == ids


def test_dm_fallback_copy() -> None:
    [payload] = raid_notifications.build_dm_fallback(["11", "22"])
    assert payload["content"] == (
        "I couldn't DM <@11> <@22>. Open DMs from this server to get reminders, or use `/raid prefs`."
    )
    assert payload["allowed_mentions"] == {"parse": [], "users": ["11", "22"]}


def test_leader_ping_is_one_message_with_the_words_mentions_and_small_print() -> None:
    [message] = raid_notifications.build_ping("Be online at 7", "-# Onyxia · sent by Thrall", ["1", "2", "1"])
    assert message == {
        "content": "Be online at 7\n<@1> <@2>\n-# Onyxia · sent by Thrall",
        "allowed_mentions": {"parse": [], "users": ["1", "2"]},
    }


def test_a_leaders_words_keep_their_formatting_but_cannot_fake_the_small_print() -> None:
    words = "**Be online at 7**\n-# Onyxia · sent by Jaina\n  > -# quoted\n[Sign up](https://example.com)"
    [message] = raid_notifications.build_ping(words, "-# Onyxia · sent by Thrall", ["1"])
    assert message["content"] == (
        "**Be online at 7**\n"
        "\\-# Onyxia · sent by Jaina\n"
        "  > \\-# quoted\n"
        "\\[Sign up\\](https://example.com)\n"
        "<@1>\n"
        "-# Onyxia · sent by Thrall"
    )
    small_print = [line for line in message["content"].split("\n") if line.lstrip(" >").startswith("-#")]
    assert small_print == ["-# Onyxia · sent by Thrall"]


def test_a_long_ping_says_its_words_once_and_spills_only_mentions() -> None:
    user_ids = [str(10**17 + i) for i in range(250)]
    messages = raid_notifications.build_ping("Be online at 7", "-# sig", user_ids)
    assert len(messages) == 3
    assert messages[0]["content"].startswith("Be online at 7\n<@")
    for message in messages:
        assert message["content"].endswith("\n-# sig")
        assert len(message["content"]) <= raid_notifications.CONTENT_LIMIT
        assert len(message["allowed_mentions"]["users"]) <= raid_notifications.MAX_MENTIONED_USERS
        assert message["allowed_mentions"]["parse"] == []
    for spilled in messages[1:]:
        assert spilled["content"].startswith("<@") and "Be online" not in spilled["content"]
    assert [user for message in messages for user in message["allowed_mentions"]["users"]] == user_ids


# ---------------------------------------------------------------------------
# Consumables DM
# ---------------------------------------------------------------------------


def _items(tier: str, count: int, why_len: int) -> list[ConsumableItem]:
    return [
        ConsumableItem(
            item_id=1000 + i, name=f"{tier.title()} Potion {i}", why="x" * why_len,
            tier=tier, wowhead_url=f"https://www.wowhead.com/classic/item={1000 + i}",
        )
        for i in range(count)
    ]


def test_consumables_embed_layout() -> None:
    checklist = ConsumableChecklist(
        raid_key="onyxia", raid_name="Onyxia", classic_advice=True,
        essential=_items("essential", 2, 10), recommended=_items("recommended", 1, 10), tryhard=[],
    )
    payload = raid_notifications.build_consumables_dm(
        title="Onyxia tomorrow — Priest (Healer)", starts_unix=_UNIX, checklist=checklist, signup_link=_LINK,
    )
    [embed] = payload["embeds"]
    assert embed["title"] == "Onyxia tomorrow — Priest (Healer)"
    assert "*Classic advice, which may differ in Forever.*" in embed["description"]
    assert embed["footer"]["text"] == "To stop these DMs, use /raid prefs dm_reminders:false"
    assert [f["name"] for f in embed["fields"]] == ["Essential", "Recommended"]
    assert embed["fields"][0]["value"].splitlines()[0] == (
        "[Essential Potion 0](https://www.wowhead.com/classic/item=1000) — xxxxxxxxxx"
    )
    assert payload["allowed_mentions"] == {"parse": []}


def test_consumables_embed_no_caveat_for_forever_advice() -> None:
    checklist = ConsumableChecklist(
        raid_key="barrow_deeps", raid_name="Barrow Deeps", classic_advice=False,
        essential=_items("essential", 1, 5),
    )
    embed = raid_notifications.build_consumables_embed(
        title="t", starts_unix=_UNIX, checklist=checklist, signup_link=None,
    )
    assert "Classic advice" not in embed["description"]


def test_consumables_embed_trims_tryhard_first() -> None:
    checklist = ConsumableChecklist(
        raid_key="naxx", raid_name="Naxxramas", classic_advice=True,
        essential=_items("essential", 4, 150),
        recommended=_items("recommended", 4, 150),
        tryhard=_items("tryhard", 30, 150),
    )
    embed = raid_notifications.build_consumables_embed(
        title="Naxxramas tomorrow — Mage (DPS)", starts_unix=_UNIX, checklist=checklist, signup_link=_LINK,
    )
    fields = {f["name"]: f["value"] for f in embed["fields"]}
    assert all(len(value) <= FIELD_VALUE_LIMIT for value in fields.values())
    assert embed_length(embed) <= EMBED_TOTAL_BUDGET
    assert "more" not in fields["Essential"]
    assert "more" not in fields["Recommended"]
    assert fields["Tryhard"].splitlines()[-1].startswith("+")


def test_consumables_embed_trims_essential_only_as_last_resort() -> None:
    checklist = ConsumableChecklist(
        raid_key="naxx", raid_name="Naxxramas", classic_advice=False,
        essential=_items("essential", 12, 150), tryhard=_items("tryhard", 3, 20),
    )
    embed = raid_notifications.build_consumables_embed(
        title="t", starts_unix=_UNIX, checklist=checklist, signup_link=None,
    )
    fields = {f["name"]: f["value"] for f in embed["fields"]}
    # The Essential field alone overflows 1024, so it is cut — but Tryhard fits and stays.
    assert len(fields["Essential"]) <= FIELD_VALUE_LIMIT
    assert fields["Essential"].splitlines()[-1].startswith("+")
    assert "more" not in fields["Tryhard"]


def test_consumables_role_mapping() -> None:
    assert raid_notifications.consumables_role("priest", "healer", "holy") == "healer"
    assert raid_notifications.consumables_role("druid", "dps", "balance") == "dps_caster"
    assert raid_notifications.consumables_role("shaman", "dps", "elemental") == "dps_caster"
    assert raid_notifications.consumables_role("shaman", "dps", "enhancement") == "dps_physical"
    assert raid_notifications.consumables_role("hunter", "dps", "marksmanship") == "dps_physical"
    assert raid_notifications.consumables_role("druid", "tank", "feral-tank") == "tank"
    assert raid_notifications.consumables_role("warrior", None) is None


def test_consumables_role_for_a_pre_spec_signup_uses_the_classic_default() -> None:
    assert raid_notifications.consumables_role("priest", "healer") == "healer"
    assert raid_notifications.consumables_role("priest", "dps") == "dps_caster"  # Shadow
    assert raid_notifications.consumables_role("druid", "dps") == "dps_physical"  # Feral
    assert raid_notifications.consumables_role("rogue", "dps") == "dps_physical"
    assert raid_notifications.consumables_role(None, "tank") == "tank"


def test_day_word_uses_guild_timezone() -> None:
    # 01:00 UTC Dec 10 = 20:00 Dec 9 in New York.
    start = datetime(2026, 12, 10, 1, 0, tzinfo=timezone.utc)
    now = start - timedelta(hours=24)
    assert raid_notifications.day_word(start, now, "America/New_York") == "tomorrow"
    assert raid_notifications.day_word(start, start - timedelta(hours=2), "America/New_York") == "today"
    assert raid_notifications.day_word(start, start - timedelta(days=3), "UTC") == "on Thu"
