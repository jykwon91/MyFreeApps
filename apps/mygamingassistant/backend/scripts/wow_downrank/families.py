"""The spell families the downrank calculator covers: ranked heals and nukes players cast at a lower rank.

A family is a class + a spell name; its ranks are found in the client by that
class's skill lines (``wow_macros.build.CLASS_LINES``) and the name. ``kind``
says which effects count: a heal's direct heal and heal-over-time, a nuke's
direct damage and damage-over-time.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

KIND_HEAL = "heal"
KIND_DAMAGE = "damage"


@dataclass(frozen=True)
class Family:
    class_id: str
    name: str
    kind: str

    @property
    def id(self) -> str:
        """``priest-lesser-heal`` — a link's ``?spell=``; never change one."""
        return f"{self.class_id}-{re.sub(r'[^a-z]+', '-', self.name.lower()).strip('-')}"


FAMILIES: tuple[Family, ...] = (
    Family("druid", "Healing Touch", KIND_HEAL),
    Family("druid", "Regrowth", KIND_HEAL),
    Family("druid", "Rejuvenation", KIND_HEAL),
    Family("druid", "Wrath", KIND_DAMAGE),
    Family("druid", "Starfire", KIND_DAMAGE),
    Family("mage", "Frostbolt", KIND_DAMAGE),
    Family("mage", "Fireball", KIND_DAMAGE),
    Family("paladin", "Holy Light", KIND_HEAL),
    Family("paladin", "Flash of Light", KIND_HEAL),
    Family("priest", "Lesser Heal", KIND_HEAL),
    Family("priest", "Heal", KIND_HEAL),
    Family("priest", "Greater Heal", KIND_HEAL),
    Family("priest", "Flash Heal", KIND_HEAL),
    Family("priest", "Renew", KIND_HEAL),
    Family("priest", "Prayer of Healing", KIND_HEAL),
    Family("priest", "Smite", KIND_DAMAGE),
    Family("priest", "Mind Blast", KIND_DAMAGE),
    Family("shaman", "Healing Wave", KIND_HEAL),
    Family("shaman", "Lesser Healing Wave", KIND_HEAL),
    Family("shaman", "Chain Heal", KIND_HEAL),
    Family("shaman", "Lightning Bolt", KIND_DAMAGE),
    Family("warlock", "Shadow Bolt", KIND_DAMAGE),
)
