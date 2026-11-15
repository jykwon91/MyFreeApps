"""Turn a profession's client recipes into the records the leveling guide reads.

Chain: ``SkillLineAbility`` (SkillLine 197 Tailoring / 333 Enchanting / 171
Alchemy / 129 First Aid ...) →
recipe spell → its reagents (``SpellReagents``) and what it makes (a
``CREATE_ITEM`` effect → ``ItemSparse``; an enchant makes no item). The
skill colours come from the same row: ``TrivialSkillLineRankLow`` is where
the recipe turns yellow, ``TrivialSkillLineRankHigh`` where it turns grey
(green is half-way, as in game). The skill needed to *learn* a recipe isn't
in the client — a Pattern / Formula / Recipe / Manual item carries it (``RequiredSkillRank``);
a trainer's is server-side (see ``build.load_trainer_skill``).

The same chain run on the Classic Era client says what Forever changed.

The Classic Era client shares its tables with Season of Discovery, so its
recipes are in the Forever client too though Forever never teaches them. A
recipe that isn't new in Forever and doesn't come with the skill is kept only
when a real Classic source teaches it (``classic_source``); the rest are
Season of Discovery's and left out.

A kept recipe the Forever client names no teaching item for isn't always a
trainer's: Classic taught some by a pattern the Forever client doesn't ship, a
quest, or an NPC. ``classic_learn`` says which, so the guide doesn't send
players to a trainer that can't teach it.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

TAILORING_SKILL_LINE = 197
ENCHANTING_SKILL_LINE = 333
ALCHEMY_SKILL_LINE = 171
BLACKSMITHING_SKILL_LINE = 164
LEATHERWORKING_SKILL_LINE = 165
ENGINEERING_SKILL_LINE = 202
MINING_SKILL_LINE = 186
FIRST_AID_SKILL_LINE = 129
EFFECT_CREATE_ITEM = 24
EFFECT_LEARN_SPELL = 36
EFFECT_ENCHANT_ITEM = 53
# SkillLineAbility.AcquireMethod: learned with the profession itself.
ACQUIRE_ON_SKILL_LEARN = 1
# Items a teaching item's name starts with.
TEACHING_PREFIXES = ("Pattern: ", "Formula: ", "Recipe: ", "Plans: ", "Schematic: ", "Manual: ")
# Item classes a disenchanter can break: weapons and armour.
DISENCHANTABLE_CLASSES = {2, 4}
UNCOMMON = 2


@dataclass(frozen=True)
class ClientRecipes:
    """One client build's rows for the profession (already parsed into ints)."""

    # recipe spell -> (yellow, grey, acquired on learning the skill)
    abilities: dict[int, tuple[int, int, bool]]
    names: dict[int, str]
    # recipe spell -> [(item, count)]
    reagents: dict[int, list[tuple[int, int]]]
    # recipe spell -> (created item, count)
    creates: dict[int, tuple[int, int]]
    enchants: set[int] = field(default_factory=set)
    # recipe spell -> (tool item, tool name) it needs in the bags (a runed rod)
    tools: dict[int, tuple[int, str]] = field(default_factory=dict)


@dataclass(frozen=True)
class Items:
    """Forever client items: name, quality, class, and teaching items."""

    names: dict[int, str]
    quality: dict[int, int]
    item_class: dict[int, int]
    # recipe spell -> (teaching item id, its name, skill it asks, specialization it asks or 0)
    taught_by: dict[int, tuple[int, str, int, int]] = field(default_factory=dict)


@dataclass(frozen=True)
class ClassicTeaching:
    """What real Classic sources (cmangos classic-db, which has no Season of Discovery content) teach.

    ``trainer``: recipes a Classic trainer of the profession teaches.
    ``items``: every Classic item id. ``quest``: recipe -> the quests whose
    reward teaches it, as (id, title). ``npc``: recipe -> who teaches it from a
    gossip menu (Knot Thimblejack's Gordok Ogre Suit): NPC or object names,
    empty when cmangos ties the script to nobody. ``era_item``: recipe -> the
    Classic Era client's teaching item for it that is a Classic item, as (id,
    name, Classic skill) — that client carries the Naxxramas, Ahn'Qiraj and
    Zul'Gurub patterns the Forever client's item table lacks. ``sourced``: the
    Classic items a vendor, drop, quest or container gives.
    """

    trainer: frozenset[int]
    items: frozenset[int]
    quest: Mapping[int, tuple[tuple[int, str], ...]] = field(default_factory=dict)
    npc: Mapping[int, tuple[str, ...]] = field(default_factory=dict)
    era_item: Mapping[int, tuple[int, str, int]] = field(default_factory=dict)
    sourced: frozenset[int] = frozenset()


def classic_source(spell: int, era: ClientRecipes, items: Items, classic: ClassicTeaching) -> str | None:
    """How a Classic player learned the recipe — "item", "trainer", "start", "quest" or "npc" — or None when nothing in Classic teaches it."""
    teacher = items.taught_by.get(spell)
    if teacher and teacher[0] in classic.items:
        return "item"
    if spell in classic.trainer:
        return "trainer"
    if spell in era.abilities and era.abilities[spell][2]:
        return "start"
    if spell in classic.quest:
        return "quest"
    if spell in classic.npc:
        return "npc"
    if spell in classic.era_item:
        return "item"
    return None


def classic_learn(spell: int, record: dict, classic: ClassicTeaching) -> dict | None:
    """Where to learn a recipe the Forever client names no teaching item for, from Classic; None = its trainer.

    A Classic trainer's recipe stays the trainer's. Otherwise, strongest
    evidence first: the Classic Era client's pattern when something gives that
    pattern, the quest that rewards the recipe, the NPC (or object) whose
    gossip teaches it, then the pattern even with no known source. An Era
    pattern's skill is Classic's, moved as Forever moved the recipe
    (``forever_trainer_skill``) and marked ``estimated`` when that changes it.
    """
    if spell in classic.trainer:
        return None
    era_item = classic.era_item.get(spell)
    if era_item and era_item[0] in classic.sourced:
        return _era_item_learn(era_item, record)
    if quests := classic.quest.get(spell):
        return {"source": "quest", "quests": [{"id": quest, "title": title} for quest, title in quests]}
    if names := classic.npc.get(spell):
        return {"source": "npc", "npcs": list(names)}
    if era_item:
        return _era_item_learn(era_item, record)
    return None


def _era_item_learn(era_item: tuple[int, str, int], record: dict) -> dict:
    item, name, classic_skill = era_item
    skill = forever_trainer_skill(classic_skill, record) if classic_skill else record["yellow"]
    learn: dict = {"source": "item", "skill": skill, "itemId": item, "item": name}
    if skill != classic_skill:
        learn["estimated"] = True
    return learn


def sod_only_spells(forever: ClientRecipes, era: ClientRecipes, items: Items, classic: ClassicTeaching) -> set[int]:
    """The profession's Season of Discovery recipes: in the Classic Era client, not with the skill, taught by nothing in Classic."""
    return {
        spell for spell, (_, _, on_learn) in forever.abilities.items()
        if spell in era.abilities and not on_learn and classic_source(spell, era, items, classic) is None
    }


def _reagent_rows(items: Items, pairs: list[tuple[int, int]]) -> list[dict]:
    return [{"id": item, "name": items.names.get(item, f"Item {item}"), "count": count} for item, count in pairs]


def _changes(spell: int, forever: ClientRecipes, era: ClientRecipes) -> list[str] | None:
    """What Forever changed against Classic Era: None when new, else the changed parts."""
    if spell not in era.abilities:
        return None
    changed = []
    if forever.abilities[spell][:2] != era.abilities[spell][:2]:
        changed.append("skill")
    if sorted(forever.reagents.get(spell, [])) != sorted(era.reagents.get(spell, [])):
        changed.append("reagents")
    return changed


def build_recipes(
    forever: ClientRecipes,
    era: ClientRecipes,
    items: Items,
    classic: ClassicTeaching,
    trainer_specs: dict[int, int] | None = None,
) -> list[dict]:
    """Every recipe Forever teaches for the profession, sorted by where it turns grey.

    Season of Discovery's recipes (``sod_only_spells``) are left out. A kept
    recipe that isn't new and doesn't come with the skill carries
    ``learn.classic``: how Classic taught it (``classic_source``). One the
    Forever client names no teaching item for is learned where
    ``classic_learn`` says, else from a trainer.
    ``trainer_specs``: recipe -> the specialization whose trainers alone teach it (Classic).
    """
    sod_only = sod_only_spells(forever, era, items, classic)
    out = []
    for spell, (yellow, grey, on_learn) in forever.abilities.items():
        name = forever.names.get(spell)
        if not name or spell in sod_only:
            continue
        made = forever.creates.get(spell)
        record: dict = {
            "spell": spell,
            "name": name,
            "yellow": yellow,
            "grey": grey,
            "reagents": _reagent_rows(items, forever.reagents.get(spell, [])),
        }
        if made:
            item, count = made
            quality = items.quality.get(item, 1)
            record["creates"] = {"id": item, "name": items.names.get(item, name), "count": count, "quality": quality}
            if (item_class := items.item_class.get(item)) is not None:
                record["creates"]["itemClass"] = item_class
            if quality >= UNCOMMON and items.item_class.get(item) in DISENCHANTABLE_CLASSES:
                record["disenchantable"] = True
        elif spell in forever.enchants:
            record["enchant"] = True
        if tool := forever.tools.get(spell):
            record["tool"] = {"id": tool[0], "name": tool[1]}
        changes = _changes(spell, forever, era)
        numbers = None
        if changes:
            e_yellow, e_grey, _ = era.abilities[spell]
            numbers = {"yellow": e_yellow, "grey": e_grey}
            if "reagents" in changes:
                numbers["reagents"] = _reagent_rows(items, era.reagents.get(spell, []))
        teacher = None if on_learn else items.taught_by.get(spell)
        if on_learn:
            record["learn"] = {"source": "start", "skill": 1}
        elif teacher:
            record["learn"] = {"source": "item", "skill": teacher[2], "itemId": teacher[0], "item": teacher[1]}
        else:
            moved = {**record, "classic": numbers} if numbers else record
            known = classic_learn(spell, moved, classic) if changes is not None else None
            record["learn"] = known or {"source": "trainer"}
        if spec := (teacher[3] if teacher else (trainer_specs or {}).get(spell, 0)):
            record["spec"] = spec
        if changes is not None and not on_learn:
            record["learn"]["classic"] = classic_source(spell, era, items, classic)
        if changes is None:
            record["newInForever"] = True
        elif numbers:
            record["classic"] = numbers
        out.append(record)
    return sorted(out, key=lambda r: (r["grey"], r["yellow"], r["name"], r["spell"]))


def forever_trainer_skill(classic_skill: int, recipe: dict) -> int:
    """Estimate the skill Forever asks to learn a recipe, from Classic's (a trainer's, or a pattern's).

    Forever moved most recipes' yellow / grey skill down. Its Pattern and
    Formula items moved their required skill by exactly the same amount
    (164 of 169 changed patterns in the 1.60.1 client), so a trainer
    recipe's learn skill is assumed to move with its yellow too.
    """
    shift = recipe["classic"]["yellow"] - recipe["yellow"] if "classic" in recipe else 0
    return max(1, min(classic_skill - shift, recipe["yellow"]))


def smelting_for(recipes: list[dict], mining: list[dict], mining_trainer: dict[int, int]) -> list[dict]:
    """The Mining smelts that make the bars ``recipes`` use (and the bars those need, Bronze from Copper).

    Each is a Mining recipe record plus ``skill``: the Mining skill to learn
    it — 1 when it comes with Mining, else the Classic trainer's moved as
    Forever moved the recipe (``forever_trainer_skill``).
    """
    makers: dict[int, dict] = {}
    for rec in sorted(mining, key=lambda r: r["yellow"]):
        if "creates" in rec:
            makers.setdefault(rec["creates"]["id"], rec)
    needed = [r["id"] for rec in recipes for r in rec["reagents"]]
    out: dict[int, dict] = {}
    while needed:
        item = needed.pop()
        rec = makers.get(item)
        if rec is None or rec["spell"] in out:
            continue
        out[rec["spell"]] = {**rec, "skill": _mining_learn_skill(rec, mining_trainer)}
        needed.extend(r["id"] for r in rec["reagents"])
    return sorted(out.values(), key=lambda r: (r["skill"], r["name"]))


def _mining_learn_skill(rec: dict, mining_trainer: dict[int, int]) -> int:
    """1 when it comes with Mining, else the Classic trainer's skill moved as Forever moved the recipe."""
    if rec["learn"]["source"] == "start":
        return 1
    classic = mining_trainer.get(rec["spell"])
    return forever_trainer_skill(classic, rec) if classic else rec["yellow"]


def mining_records(mining: list[dict], mining_trainer: dict[int, int], focus: dict[int, str]) -> dict[str, list[dict]]:
    """Every Mining recipe that makes something, for the Mining guide.

    ``smelting``: the ones cast next to a spell focus (``focus``: recipe ->
    "Forge", "Black Forge", "Molten Foundry"), each carrying it. ``camp``: the
    rest — Forever's campsite items. Both carry ``skill`` as ``smelting_for`` does.
    """
    out: dict[str, list[dict]] = {"smelting": [], "camp": []}
    for rec in mining:
        if "creates" not in rec:
            continue
        row = {**rec, "skill": _mining_learn_skill(rec, mining_trainer)}
        if spot := focus.get(rec["spell"]):
            out["smelting"].append({**row, "focus": spot})
        else:
            out["camp"].append(row)
    for rows in out.values():
        rows.sort(key=lambda r: (r["skill"], r["yellow"], r["name"]))
    return out
