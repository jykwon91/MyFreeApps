"""Unit tests for platform_shared.services.discord.permissions (pure)."""
from platform_shared.services.discord.permissions import (
    ADMINISTRATOR,
    ALL_PERMISSIONS,
    EMBED_LINKS,
    MANAGE_EVENTS,
    SEND_MESSAGES,
    VIEW_CHANNEL,
    compute_channel_permissions,
    has_permission,
    missing_permissions,
    parse_bitfield,
    permission_labels,
)

_GUILD = "100"
_BOT = "900"
_POST = VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS


def test_parse_bitfield_handles_strings_ints_and_garbage() -> None:
    assert parse_bitfield(str(MANAGE_EVENTS)) == MANAGE_EVENTS
    assert parse_bitfield(5) == 5
    assert parse_bitfield(None) == 0
    assert parse_bitfield("-1") == 0
    assert parse_bitfield("abc") == 0
    assert parse_bitfield(True) == 0
    assert parse_bitfield(-4) == 0


def test_has_permission_administrator_implies_everything() -> None:
    assert has_permission(ADMINISTRATOR, MANAGE_EVENTS)
    assert has_permission(MANAGE_EVENTS, MANAGE_EVENTS)
    assert not has_permission(SEND_MESSAGES, MANAGE_EVENTS)


def test_missing_permissions_and_labels() -> None:
    missing = missing_permissions(VIEW_CHANNEL, [VIEW_CHANNEL, SEND_MESSAGES, EMBED_LINKS])
    assert missing == [SEND_MESSAGES, EMBED_LINKS]
    assert permission_labels(missing) == ["Send Messages", "Embed Links"]


def _roles(everyone: int, **extra: int) -> list[dict[str, str]]:
    roles = [{"id": _GUILD, "permissions": str(everyone)}]
    roles.extend({"id": role_id, "permissions": str(bits)} for role_id, bits in extra.items())
    return roles


def test_base_permissions_from_everyone_and_member_roles() -> None:
    perms = compute_channel_permissions(
        guild_id=_GUILD, member_id=_BOT, member_role_ids=["r1"],
        guild_roles=_roles(VIEW_CHANNEL, r1=SEND_MESSAGES | EMBED_LINKS),
        channel_overwrites=[],
    )
    assert perms == _POST


def test_administrator_role_short_circuits_overwrites() -> None:
    perms = compute_channel_permissions(
        guild_id=_GUILD, member_id=_BOT, member_role_ids=["r1"],
        guild_roles=_roles(0, r1=ADMINISTRATOR),
        channel_overwrites=[{"id": _GUILD, "type": 0, "allow": "0", "deny": str(VIEW_CHANNEL)}],
    )
    assert perms == ALL_PERMISSIONS


def test_everyone_deny_then_role_allow_then_member_deny() -> None:
    overwrites = [
        {"id": _GUILD, "type": 0, "allow": "0", "deny": str(VIEW_CHANNEL | SEND_MESSAGES)},
        {"id": "r1", "type": 0, "allow": str(VIEW_CHANNEL | SEND_MESSAGES), "deny": "0"},
        {"id": _BOT, "type": 1, "allow": "0", "deny": str(EMBED_LINKS)},
    ]
    perms = compute_channel_permissions(
        guild_id=_GUILD, member_id=_BOT, member_role_ids=["r1"],
        guild_roles=_roles(_POST), channel_overwrites=overwrites,
    )
    assert has_permission(perms, VIEW_CHANNEL)
    assert has_permission(perms, SEND_MESSAGES)
    assert not has_permission(perms, EMBED_LINKS)


def test_role_overwrite_for_role_the_member_lacks_is_ignored() -> None:
    overwrites = [{"id": "r2", "type": 0, "allow": "0", "deny": str(SEND_MESSAGES)}]
    perms = compute_channel_permissions(
        guild_id=_GUILD, member_id=_BOT, member_role_ids=["r1"],
        guild_roles=_roles(_POST), channel_overwrites=overwrites,
    )
    assert perms == _POST


def test_role_allow_wins_over_role_deny_across_roles() -> None:
    overwrites = [
        {"id": "r1", "type": 0, "allow": "0", "deny": str(SEND_MESSAGES)},
        {"id": "r2", "type": 0, "allow": str(SEND_MESSAGES), "deny": "0"},
    ]
    perms = compute_channel_permissions(
        guild_id=_GUILD, member_id=_BOT, member_role_ids=["r1", "r2"],
        guild_roles=_roles(_POST), channel_overwrites=overwrites,
    )
    assert has_permission(perms, SEND_MESSAGES)
