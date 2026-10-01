"""Per-member raid preferences — remembered class/role and DM opt-out.

The caller owns the transaction.  ``member_pref_repo.upsert`` replaces every
field, so these helpers always read the current row first and carry the
fields they aren't changing.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_member_pref import WowRaidMemberPref
from app.repositories.wow import wow_raid_member_pref_repo
from app.services.wow.raid_catalog import CLASSES_BY_KEY, ROLE_LABELS, class_can_fill


@dataclass(frozen=True)
class PrefsUpdate:
    """``error`` is a user-facing explanation when the update was rejected."""

    pref: WowRaidMemberPref | None
    error: str | None = None


async def get(db: AsyncSession, *, guild: WowRaidGuild, discord_user_id: str) -> WowRaidMemberPref | None:
    return await wow_raid_member_pref_repo.get(db, guild_id=guild.id, discord_user_id=discord_user_id)


def one_tap_ready(pref: WowRaidMemberPref | None) -> bool:
    """True when the saved prefs are complete and consistent enough for one-tap signup."""
    if pref is None or pref.default_wow_class is None or pref.default_role is None:
        return False
    return class_can_fill(pref.default_wow_class, pref.default_role)


async def remember_class_role(
    db: AsyncSession, *, guild: WowRaidGuild, discord_user_id: str, wow_class: str, role: str
) -> WowRaidMemberPref:
    """Save the class/role from a signup as the member's defaults (keeps DM setting)."""
    existing = await get(db, guild=guild, discord_user_id=discord_user_id)
    dm_opt_out = existing is not None and existing.dm_opt_out
    return await wow_raid_member_pref_repo.upsert(
        db,
        guild_id=guild.id,
        discord_user_id=discord_user_id,
        default_wow_class=wow_class,
        default_role=role,
        dm_opt_out=dm_opt_out,
    )


async def update_prefs(
    db: AsyncSession,
    *,
    guild: WowRaidGuild,
    discord_user_id: str,
    wow_class: str | None,
    role: str | None,
    dm_reminders: bool | None,
) -> PrefsUpdate:
    """Apply ``/raid prefs`` options; any omitted option keeps its saved value.

    A class change keeps the saved role when the new class can still fill it,
    auto-picks the only role for single-role classes, and otherwise asks.
    """
    existing = await get(db, guild=guild, discord_user_id=discord_user_id)
    new_class = wow_class
    if new_class is None and existing is not None:
        new_class = existing.default_wow_class
    new_role = role
    if new_role is None and existing is not None:
        new_role = existing.default_role

    if new_class is not None and new_class not in CLASSES_BY_KEY:
        return PrefsUpdate(pref=existing, error="I don't know that class. Pick one from the list.")

    if new_class is not None:
        class_info = CLASSES_BY_KEY[new_class]
        if role is None and len(class_info.roles) == 1:
            new_role = class_info.roles[0]
        elif new_role is not None and not class_can_fill(new_class, new_role):
            if role is not None:
                return PrefsUpdate(pref=existing, error=_role_mismatch(new_class))
            # The saved role doesn't fit the new class — ask rather than guess.
            return PrefsUpdate(pref=existing, error=_pick_role_prompt(new_class))
    elif role is not None:
        return PrefsUpdate(pref=existing, error="Pick your class too, so I know which roles you can fill.")

    dm_opt_out = existing is not None and existing.dm_opt_out
    if dm_reminders is not None:
        dm_opt_out = not dm_reminders

    pref = await wow_raid_member_pref_repo.upsert(
        db,
        guild_id=guild.id,
        discord_user_id=discord_user_id,
        default_wow_class=new_class,
        default_role=new_role,
        dm_opt_out=dm_opt_out,
    )
    return PrefsUpdate(pref=pref)


def _allowed_roles_text(wow_class: str) -> str:
    labels = [ROLE_LABELS[role] for role in CLASSES_BY_KEY[wow_class].roles]
    if len(labels) == 1:
        return labels[0]
    return ", ".join(labels[:-1]) + f" or {labels[-1]}"


def _role_mismatch(wow_class: str) -> str:
    return f"A {CLASSES_BY_KEY[wow_class].label} can play {_allowed_roles_text(wow_class)}."


def _pick_role_prompt(wow_class: str) -> str:
    return (
        f"Which role do you play as a {CLASSES_BY_KEY[wow_class].label}? "
        f"Add `role:` ({_allowed_roles_text(wow_class)}) and run `/raid prefs` again."
    )
