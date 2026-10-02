"""Per-member raid preferences — the remembered class, per-class saved specs
and character names, and the DM opt-out.

The caller owns the transaction.  ``member_pref_repo.upsert`` replaces every
field, so the saves read the current row first and carry the fields they
aren't changing.  They read it under a row lock (``lock_or_create``): one
member's taps on two raid posts at once then save one after the other and
both land.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_member_pref import WowRaidMemberPref
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_member_pref_repo
from app.services.discord import raid_member_copy
from app.services.wow.raid_character import CharacterNameError, clean_name, saved_name
from app.services.wow.raid_catalog import (
    CLASSES,
    CLASSES_BY_KEY,
    TANK_COLUMN,
    WowSpecInfo,
    find_specs,
    saved_spec,
    signup_label,
    spec_info,
    spec_list_text,
)

# ``/raid prefs character: -`` clears the name.
_CLEAR_NAME: Final = "-"


@dataclass(frozen=True)
class NamedCharacter:
    """The character name ``/raid prefs`` saved for a class (None: cleared it)."""

    wow_class: str
    name: str | None


@dataclass(frozen=True)
class PrefsUpdate:
    """``error`` is a user-facing explanation when the update was rejected.

    ``named`` is set when the update saved or cleared a character name.
    """

    pref: WowRaidMemberPref | None
    error: str | None = None
    named: NamedCharacter | None = None


@dataclass(frozen=True)
class PlayerPick:
    """The class, seat role and spec to personalise a message with (any may be None)."""

    wow_class: str | None
    role: str | None
    spec: str | None

    @property
    def label(self) -> str:
        return signup_label(self.wow_class, self.role, self.spec)

    @property
    def known_spec(self) -> WowSpecInfo | None:
        """The spec, when it is set and belongs to the class."""
        return spec_info(self.wow_class, self.spec)


async def get(db: AsyncSession, *, guild: WowRaidGuild, discord_user_id: str) -> WowRaidMemberPref | None:
    return await wow_raid_member_pref_repo.get(db, guild_id=guild.id, discord_user_id=discord_user_id)


def saved_spec_for(pref: WowRaidMemberPref | None, wow_class: str | None) -> WowSpecInfo | None:
    """The spec the member saved for *wow_class*."""
    if pref is None:
        return None
    return saved_spec(pref.saved_specs, wow_class)


def saved_name_for(pref: WowRaidMemberPref | None, wow_class: str | None) -> str | None:
    """The character name the member saved for *wow_class*."""
    if pref is None:
        return None
    return saved_name(pref.character_names, wow_class)


def has_saved_specs(pref: WowRaidMemberPref | None) -> bool:
    """Whether Forget my specs has anything to forget: a remembered class or a saved spec."""
    if pref is None:
        return False
    return pref.default_wow_class is not None or bool(pref.saved_specs)


def one_tap_spec(pref: WowRaidMemberPref | None) -> WowSpecInfo | None:
    """The spec a status button uses without asking: the remembered class's saved spec."""
    if pref is None:
        return None
    return saved_spec_for(pref, pref.default_wow_class)


def saved_spec_for_column(pref: WowRaidMemberPref | None, column: str) -> WowSpecInfo | None:
    """The saved spec a class button on the post signs up with, or None to ask.

    A class's column holds its damage and healing specs (its tank spec shows
    under Tanks), so a saved tank spec doesn't count for the class's button.
    [Tank] takes the remembered class's spec when it tanks, else the one
    saved tank spec; with several, the player picks.
    """
    if pref is None:
        return None
    if column != TANK_COLUMN:
        spec = saved_spec_for(pref, column)
        if spec is not None and spec.column == column:
            return spec
        return None
    default = one_tap_spec(pref)
    if default is not None and default.column == TANK_COLUMN:
        return default
    tanks = [spec for spec in (saved_spec_for(pref, cls.key) for cls in CLASSES) if spec is not None]
    tanks = [spec for spec in tanks if spec.column == TANK_COLUMN]
    if len(tanks) == 1:
        return tanks[0]
    return None


def resolve_player(signup: WowRaidSignup | None, pref: WowRaidMemberPref | None) -> PlayerPick:
    """This raid's class and spec, else the member's saved default.

    A remembered class without a saved spec comes back with ``spec=None``
    (the bot asks for it).
    """
    if signup is not None and signup.wow_class is not None:
        return PlayerPick(signup.wow_class, signup.role, signup.spec)
    spec = one_tap_spec(pref)
    if spec is not None:
        return PlayerPick(spec.class_key, spec.raid_role, spec.key)
    if pref is None:
        return PlayerPick(None, None, None)
    return PlayerPick(pref.default_wow_class, pref.default_role, None)


async def remember_spec(
    db: AsyncSession, *, guild: WowRaidGuild, discord_user_id: str, spec: WowSpecInfo
) -> bool:
    """Make *spec* the member's default (its class + that class's saved spec).

    Keeps the DM setting and the other classes' specs.  Returns True when the
    class had no saved spec before, so the caller can say "next time it's one tap".
    """
    existing = await wow_raid_member_pref_repo.lock_or_create(
        db, guild_id=guild.id, discord_user_id=discord_user_id
    )
    saved = dict(existing.saved_specs)
    first_save = saved_spec(saved, spec.class_key) is None
    saved[spec.class_key] = spec.key
    await wow_raid_member_pref_repo.upsert(
        db,
        guild_id=guild.id,
        discord_user_id=discord_user_id,
        default_wow_class=spec.class_key,
        default_role=spec.raid_role,
        saved_specs=saved,
        dm_opt_out=existing.dm_opt_out,
    )
    return first_save


async def set_character_name(
    db: AsyncSession, *, guild: WowRaidGuild, discord_user_id: str, wow_class: str, name: str | None
) -> bool:
    """Save *name* as the member's character for *wow_class* (None forgets it); True when that changed it.

    Keeps everything else.  *name* comes from ``raid_character.clean_name``.
    """
    existing = await wow_raid_member_pref_repo.lock_or_create(
        db, guild_id=guild.id, discord_user_id=discord_user_id
    )
    names = _renamed(existing.character_names, wow_class, name)
    if names == existing.character_names:
        return False
    await wow_raid_member_pref_repo.set_character_names(db, existing, names)
    return True


async def forget_specs(db: AsyncSession, *, guild: WowRaidGuild, discord_user_id: str) -> bool:
    """Forget the member's remembered class and saved specs; True when there was something to forget.

    Keeps the DM setting and the character names, and never creates a row:
    with nothing saved, nothing is written.
    """
    if not has_saved_specs(await get(db, guild=guild, discord_user_id=discord_user_id)):
        return False
    existing = await wow_raid_member_pref_repo.lock_or_create(
        db, guild_id=guild.id, discord_user_id=discord_user_id
    )
    if not has_saved_specs(existing):  # forgotten by another tap while this one waited
        return False
    await wow_raid_member_pref_repo.upsert(
        db,
        guild_id=guild.id,
        discord_user_id=discord_user_id,
        default_wow_class=None,
        default_role=None,
        saved_specs={},
        dm_opt_out=existing.dm_opt_out,
    )
    return True


async def update_prefs(
    db: AsyncSession,
    *,
    guild: WowRaidGuild,
    discord_user_id: str,
    wow_class: str | None,
    spec: str | None,
    dm_reminders: bool | None,
    character: str | None = None,
) -> PrefsUpdate:
    """Apply ``/raid prefs`` options; any omitted option keeps its saved value.

    ``spec`` is free text (the autocomplete value, an id or a name) and
    implies its class.  A class without a spec is fine: the bot asks for the
    spec the first time that class signs up.  ``character`` names the
    character of the class the command leaves remembered (``-`` clears it);
    sign-ups already made keep the name they show.
    """
    error = None
    picked = None
    if wow_class is not None and wow_class not in CLASSES_BY_KEY:
        error = "I don't know that class. Pick one from the list."
    elif spec is not None:
        matches = find_specs(spec, wow_class)
        if not matches:
            error = _unknown_spec(wow_class)
        elif len(matches) > 1:
            error = _ambiguous_spec(matches)
        else:
            picked = matches[0]
    if error is not None:
        return await _refused(db, guild=guild, discord_user_id=discord_user_id, error=error)
    name = None
    if character is not None:
        try:
            name = _typed_name(character)
        except CharacterNameError as problem:
            refusal = raid_member_copy.name_refusal(problem.reason, problem.length)
            return await _refused(db, guild=guild, discord_user_id=discord_user_id, error=refusal)
        if wow_class is None and picked is None:
            current = await get(db, guild=guild, discord_user_id=discord_user_id)
            if current is None or current.default_wow_class is None:
                return PrefsUpdate(pref=current, error=raid_member_copy.CHAR_PREFS_NEEDS_CLASS)

    existing = await wow_raid_member_pref_repo.lock_or_create(
        db, guild_id=guild.id, discord_user_id=discord_user_id
    )
    saved = dict(existing.saved_specs)
    new_class = wow_class
    if new_class is None:
        new_class = existing.default_wow_class
    if picked is not None:
        saved[picked.class_key] = picked.key
        new_class = picked.class_key

    dm_opt_out = existing.dm_opt_out
    if dm_reminders is not None:
        dm_opt_out = not dm_reminders

    pref = await wow_raid_member_pref_repo.upsert(
        db,
        guild_id=guild.id,
        discord_user_id=discord_user_id,
        default_wow_class=new_class,
        default_role=_default_role(existing, new_class, saved),
        saved_specs=saved,
        dm_opt_out=dm_opt_out,
    )
    if character is None:
        return PrefsUpdate(pref=pref)
    if new_class is None:
        # "Forget my specs" ran since the check above: no class to name the character for.
        return PrefsUpdate(pref=pref, error=raid_member_copy.CHAR_PREFS_NEEDS_CLASS)
    names = _renamed(pref.character_names, new_class, name)
    if names != pref.character_names:
        await wow_raid_member_pref_repo.set_character_names(db, pref, names)
    return PrefsUpdate(pref=pref, named=NamedCharacter(new_class, name))


async def _refused(db: AsyncSession, *, guild: WowRaidGuild, discord_user_id: str, error: str) -> PrefsUpdate:
    """A rejected update: nothing saved, the card shows what's saved already."""
    return PrefsUpdate(pref=await get(db, guild=guild, discord_user_id=discord_user_id), error=error)


def _typed_name(character: str) -> str | None:
    """The name ``character:`` asks for; ``-`` clears it."""
    if character.strip() == _CLEAR_NAME:
        return None
    return clean_name(character)


def _renamed(names: Mapping[str, object], wow_class: str, name: str | None) -> dict[str, object]:
    """*names* with *wow_class*'s set to *name* (None removes it); a new dict, so the change is saved."""
    renamed = dict(names)
    renamed.pop(wow_class, None)
    if name is not None:
        renamed[wow_class] = name
    return renamed


def _default_role(existing: WowRaidMemberPref, new_class: str | None, saved: dict[str, str]) -> str | None:
    """The seat role of the class's saved spec; a pre-spec role survives only while the class is unchanged."""
    spec = saved_spec(saved, new_class)
    if spec is not None:
        return spec.raid_role
    if existing.default_wow_class == new_class:
        return existing.default_role
    return None


def _unknown_spec(wow_class: str | None) -> str:
    if wow_class is None:
        return "I don't know that spec. Pick one from the list."
    return f"A {CLASSES_BY_KEY[wow_class].label} can be {spec_list_text(wow_class)}."


def _ambiguous_spec(matches: list[WowSpecInfo]) -> str:
    options = " or ".join(spec.full_label for spec in matches)
    return f"Did you mean {options}? Add `class:` too, or pick from the list."
