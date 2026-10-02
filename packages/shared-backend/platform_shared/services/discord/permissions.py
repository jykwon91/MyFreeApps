"""Discord permission bitfield helpers.

Discord serialises permission bitfields as decimal strings (they exceed 32
bits — MANAGE_EVENTS is bit 33).  These helpers parse them defensively and
compute a member's effective permissions in a channel from REST data,
following the algorithm in
https://discord.com/developers/docs/topics/permissions#permission-overwrites.

Everything here is pure — no I/O — so it can be unit-tested exhaustively.
"""
from collections.abc import Iterable, Mapping
from typing import Any, Final

# ---------------------------------------------------------------------------
# Permission bits (subset the platform uses)
# ---------------------------------------------------------------------------

ADMINISTRATOR: Final = 1 << 3
MANAGE_GUILD: Final = 1 << 5
VIEW_CHANNEL: Final = 1 << 10
SEND_MESSAGES: Final = 1 << 11
EMBED_LINKS: Final = 1 << 14
MENTION_EVERYONE: Final = 1 << 17
MANAGE_EVENTS: Final = 1 << 33
CREATE_PUBLIC_THREADS: Final = 1 << 35
CREATE_EVENTS: Final = 1 << 44

ALL_PERMISSIONS: Final = (1 << 64) - 1

# Human-readable names, as shown in the Discord client, for user-facing copy.
PERMISSION_LABELS: Final[dict[int, str]] = {
    ADMINISTRATOR: "Administrator",
    MANAGE_GUILD: "Manage Server",
    VIEW_CHANNEL: "View Channel",
    SEND_MESSAGES: "Send Messages",
    EMBED_LINKS: "Embed Links",
    MENTION_EVERYONE: "Mention @everyone, @here and All Roles",
    MANAGE_EVENTS: "Manage Events",
    CREATE_PUBLIC_THREADS: "Create Public Threads",
    CREATE_EVENTS: "Create Events",
}

# Overwrite types in a channel's ``permission_overwrites`` array.
_OVERWRITE_TYPE_ROLE: Final = 0
_OVERWRITE_TYPE_MEMBER: Final = 1


def parse_bitfield(raw: Any) -> int:
    """Parse a Discord permission bitfield (decimal string or int) to ``int``.

    Anything unparseable becomes ``0`` (no permissions) — fail closed.
    """
    if isinstance(raw, bool):
        return 0
    if isinstance(raw, int):
        return raw if raw >= 0 else 0
    if isinstance(raw, str) and raw.isdigit():
        return int(raw)
    return 0


def has_permission(bitfield: int, permission: int) -> bool:
    """True when ``bitfield`` grants ``permission``.  ADMINISTRATOR implies all."""
    if bitfield & ADMINISTRATOR:
        return True
    return bitfield & permission == permission


def missing_permissions(bitfield: int, required: Iterable[int]) -> list[int]:
    """Return the subset of ``required`` bits not granted by ``bitfield``."""
    return [perm for perm in required if not has_permission(bitfield, perm)]


def permission_labels(permissions: Iterable[int]) -> list[str]:
    """Map permission bits to their Discord-client names (unknown bits → hex)."""
    return [PERMISSION_LABELS.get(perm, hex(perm)) for perm in permissions]


def compute_channel_permissions(
    *,
    guild_id: str,
    member_id: str,
    member_role_ids: Iterable[str],
    guild_roles: Iterable[Mapping[str, Any]],
    channel_overwrites: Iterable[Mapping[str, Any]],
) -> int:
    """Compute a member's effective permissions in a channel.

    Args:
        guild_id:           Guild snowflake — the @everyone role shares this ID.
        member_id:          The member's user snowflake.
        member_role_ids:    Role IDs from the guild member object (excludes @everyone).
        guild_roles:        Role objects from ``GET /guilds/{id}/roles``.
        channel_overwrites: ``permission_overwrites`` from ``GET /channels/{id}``.

    Guild ownership is not considered — callers computing a bot's permissions
    never need it (a bot cannot own a guild it was invited to).
    """
    role_perms = {str(role.get("id")): parse_bitfield(role.get("permissions")) for role in guild_roles}
    member_roles = {str(role_id) for role_id in member_role_ids}

    base = role_perms.get(guild_id, 0)
    for role_id in member_roles:
        base |= role_perms.get(role_id, 0)
    if base & ADMINISTRATOR:
        return ALL_PERMISSIONS

    overwrites = list(channel_overwrites)
    perms = base

    for overwrite in overwrites:
        if str(overwrite.get("id")) == guild_id:
            perms &= ~parse_bitfield(overwrite.get("deny"))
            perms |= parse_bitfield(overwrite.get("allow"))

    role_allow = 0
    role_deny = 0
    for overwrite in overwrites:
        overwrite_id = str(overwrite.get("id"))
        if (
            overwrite.get("type") == _OVERWRITE_TYPE_ROLE
            and overwrite_id != guild_id
            and overwrite_id in member_roles
        ):
            role_allow |= parse_bitfield(overwrite.get("allow"))
            role_deny |= parse_bitfield(overwrite.get("deny"))
    perms &= ~role_deny
    perms |= role_allow

    for overwrite in overwrites:
        if overwrite.get("type") == _OVERWRITE_TYPE_MEMBER and str(overwrite.get("id")) == member_id:
            perms &= ~parse_bitfield(overwrite.get("deny"))
            perms |= parse_bitfield(overwrite.get("allow"))

    return perms
