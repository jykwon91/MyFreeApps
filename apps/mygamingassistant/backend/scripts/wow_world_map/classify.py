"""Classify a cmangos ``creature_template`` row into a World Map service type.

Returns ``(subkind, tag)`` or ``None`` for NPCs the map doesn't show.
``subkind`` values are mirrored by the frontend ``SERVICE_KIND`` constant in
``src/games/wow-forever/data/worldMap/serviceKinds.ts`` — change both together.
``tag`` narrows a subkind: the class id for class trainers (matching
``data/classes.ts``), the profession id for profession trainers.

Flag values are the 1.12 client's ``NPCFlags``; TrainerType is cmangos'
0 = class, 1 = mount, 2 = trade skill, 3 = hunter pet.
"""
from __future__ import annotations

from collections.abc import Mapping

NPC_FLAG_FLIGHT_MASTER = 0x8
NPC_FLAG_TRAINER = 0x10
NPC_FLAG_INNKEEPER = 0x80
NPC_FLAG_BANKER = 0x100
NPC_FLAG_AUCTIONEER = 0x1000
NPC_FLAG_STABLE_MASTER = 0x2000
NPC_FLAG_REPAIR = 0x4000

TRAINER_TYPE_CLASS = 0
TRAINER_TYPE_MOUNT = 1
TRAINER_TYPE_TRADESKILL = 2
TRAINER_TYPE_PET = 3

# ChrClasses.ID -> frontend WowClassId.
CLASS_IDS: Mapping[int, str] = {
    1: "warrior",
    2: "paladin",
    3: "hunter",
    4: "rogue",
    5: "priest",
    7: "shaman",
    8: "mage",
    9: "warlock",
    11: "druid",
}

# Ordered: first matching keyword in the trainer's subtitle wins.
PROFESSION_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("First Aid", "first_aid"),
    ("Physician", "first_aid"),
    ("Trauma Surgeon", "first_aid"),
    ("Alchemist", "alchemy"),
    ("Blacksmith", "blacksmithing"),
    ("Armor Crafter", "blacksmithing"),
    ("Weapon Crafter", "blacksmithing"),
    ("Armorsmith", "blacksmithing"),
    ("Weaponsmith", "blacksmithing"),
    ("Enchant", "enchanting"),
    ("Engineer", "engineering"),
    ("Herbalis", "herbalism"),
    ("Leatherwork", "leatherworking"),
    ("Leathercraft", "leatherworking"),
    ("Mining", "mining"),
    ("Miner", "mining"),
    ("Skinn", "skinning"),
    ("Tailor", "tailoring"),
    ("Cook", "cooking"),
    ("Butcher", "cooking"),
    ("Fish", "fishing"),
)

CLASS_TRAINER = "class_trainer"
DEMON_TRAINER = "demon_trainer"
PET_TRAINER = "pet_trainer"
PROFESSION_TRAINER = "profession_trainer"
WEAPON_MASTER = "weapon_master"
RIDING_TRAINER = "riding_trainer"
FLIGHT_MASTER = "flight_master"
INNKEEPER = "innkeeper"
BANKER = "banker"
AUCTIONEER = "auctioneer"
STABLE_MASTER = "stable_master"
REPAIR = "repair"


def profession_for(subname: str) -> str | None:
    for keyword, profession in PROFESSION_KEYWORDS:
        if keyword in subname:
            return profession
    return None


def classify(template: Mapping[str, object]) -> tuple[str, str] | None:
    flags = int(template["NpcFlags"] or 0)  # type: ignore[arg-type]
    subname = str(template["SubName"] or "")
    trainer_type = int(template["TrainerType"] or 0)  # type: ignore[arg-type]

    if subname in ("Demon Trainer", "Demon Master"):
        return DEMON_TRAINER, "warlock"
    if flags & NPC_FLAG_TRAINER:
        if subname == "Weapon Master":
            return WEAPON_MASTER, ""
        if trainer_type == TRAINER_TYPE_CLASS:
            cls = CLASS_IDS.get(int(template["TrainerClass"] or 0))  # type: ignore[arg-type]
            return (CLASS_TRAINER, cls) if cls else None
        if trainer_type == TRAINER_TYPE_PET:
            return PET_TRAINER, "hunter"
        if trainer_type == TRAINER_TYPE_MOUNT:
            return RIDING_TRAINER, ""
        if trainer_type == TRAINER_TYPE_TRADESKILL:
            profession = profession_for(subname)
            return (PROFESSION_TRAINER, profession) if profession else None
    if flags & NPC_FLAG_FLIGHT_MASTER:
        return FLIGHT_MASTER, ""
    if flags & NPC_FLAG_BANKER:
        return BANKER, ""
    if flags & NPC_FLAG_AUCTIONEER:
        return AUCTIONEER, ""
    if flags & NPC_FLAG_INNKEEPER and subname == "Innkeeper":
        return INNKEEPER, ""
    if flags & NPC_FLAG_STABLE_MASTER:
        return STABLE_MASTER, ""
    if flags & NPC_FLAG_REPAIR:
        return REPAIR, ""
    return None
