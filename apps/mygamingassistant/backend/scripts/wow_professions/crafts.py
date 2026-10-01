"""Turn a profession's client recipes into the records the leveling guide reads.

Chain: ``SkillLineAbility`` (SkillLine 197 Tailoring / 333 Enchanting) →
recipe spell → its reagents (``SpellReagents``) and what it makes (a
``CREATE_ITEM`` effect → ``ItemSparse``; an enchant makes no item). The
skill colours come from the same row: ``TrivialSkillLineRankLow`` is where
the recipe turns yellow, ``TrivialSkillLineRankHigh`` where it turns grey
(green is half-way, as in game). The skill needed to *learn* a recipe isn't
in the client — a Pattern / Formula item carries it (``RequiredSkillRank``);
a trainer's is server-side (see ``build.load_trainer_skill``).

The same chain run on the Classic Era client says what Forever changed.
"""
from __future__ import annotations

from dataclasses import dataclass, field

TAILORING_SKILL_LINE = 197
ENCHANTING_SKILL_LINE = 333
EFFECT_CREATE_ITEM = 24
EFFECT_LEARN_SPELL = 36
EFFECT_ENCHANT_ITEM = 53
# SkillLineAbility.AcquireMethod: learned with the profession itself.
ACQUIRE_ON_SKILL_LEARN = 1
# Items a teaching item's name starts with.
TEACHING_PREFIXES = ("Pattern: ", "Formula: ", "Recipe: ", "Plans: ", "Schematic: ")
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
    # recipe spell -> (teaching item id, its name, skill it asks)
    taught_by: dict[int, tuple[int, str, int]] = field(default_factory=dict)


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


def build_recipes(forever: ClientRecipes, era: ClientRecipes, items: Items) -> list[dict]:
    """Every recipe of the profession in Forever, sorted by where it turns grey."""
    out = []
    for spell, (yellow, grey, on_learn) in forever.abilities.items():
        name = forever.names.get(spell)
        if not name:
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
            if quality >= UNCOMMON and items.item_class.get(item) in DISENCHANTABLE_CLASSES:
                record["disenchantable"] = True
        elif spell in forever.enchants:
            record["enchant"] = True
        if tool := forever.tools.get(spell):
            record["tool"] = {"id": tool[0], "name": tool[1]}
        if on_learn:
            record["learn"] = {"source": "start", "skill": 1}
        elif teacher := items.taught_by.get(spell):
            record["learn"] = {"source": "item", "skill": teacher[2], "itemId": teacher[0], "item": teacher[1]}
        else:
            record["learn"] = {"source": "trainer"}
        changes = _changes(spell, forever, era)
        if changes is None:
            record["newInForever"] = True
        elif changes:
            e_yellow, e_grey, _ = era.abilities[spell]
            record["classic"] = {"yellow": e_yellow, "grey": e_grey}
            if "reagents" in changes:
                record["classic"]["reagents"] = _reagent_rows(items, era.reagents.get(spell, []))
        out.append(record)
    return sorted(out, key=lambda r: (r["grey"], r["yellow"], r["name"], r["spell"]))


def forever_trainer_skill(classic_skill: int, recipe: dict) -> int:
    """Estimate the skill a Forever trainer asks, from the Classic trainer's.

    Forever moved most recipes' yellow / grey skill down. Its Pattern and
    Formula items moved their required skill by exactly the same amount
    (164 of 169 changed patterns in the 1.60.1 client), so a trainer
    recipe's learn skill is assumed to move with its yellow too.
    """
    shift = recipe["classic"]["yellow"] - recipe["yellow"] if "classic" in recipe else 0
    return max(1, min(classic_skill - shift, recipe["yellow"]))
