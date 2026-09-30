"""Turn the client's Cooking recipes into food records for the picker.

Chain: Cooking ``SkillLineAbility`` (SkillLine 185) → recipe spell →
``CREATE_ITEM`` effect → item (``ItemSparse``) → its use spell
(``ItemXItemEffect`` → ``ItemEffect``) → the "Food"/"Drink" spell it
triggers (heal / mana over time) and the "Well Fed" spell it applies after
10 seconds of eating (the buff).

The buff is read from the client's own tooltip text, not from aura codes:
"gain 15 Stamina for 15 min", "gain 15% movement speed while in Westfall".
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from scripts.wow_food.tooltip import SpellBook, evaluate

COOKING_SKILL_LINE = 185
EFFECT_CREATE_ITEM = 24
EFFECT_TRIGGER_SPELL = 64
EFFECT_APPLY_AURA = 6
EFFECT_LEARN_SPELL = 36
AURA_HEAL_OVER_TIME = 84
AURA_MANA_OVER_TIME = 85
AURA_PERIODIC_TRIGGER = 227
AURA_PERIODIC_TRIGGER_LEGACY = 23
WELL_FED_XP_BOOST = 1243969
RECIPE_PREFIX = "Recipe: "

# "gain 15 Stamina for 15 min" / "gain 25 Strength and 10 Stamina for 15 min" /
# older wording "increase your Healing done by 22 for 10 min".
_DURATION_TEXT = r"(\d+ (?:sec|min|hr))"
_GAIN = re.compile(r"gain (.+?) for " + _DURATION_TEXT)
_INCREASE = re.compile(r"increase your (.+?) by (\d+(?:\.\d+)?)(%?) for " + _DURATION_TEXT)
_PART = re.compile(r"^(?:(\d+(?:\.\d+)?)(%?) )?(.+)$")
_SPLIT = re.compile(r",\s*(?:and\s+)?|\s+and\s+")
_WHILE_IN = re.compile(r"^(.*?) while in (.+)$")

# The buff wording in the client -> the Item Compare stat keys it counts as.
# "armor" is scored by the weight tables' armor weight, not a stat key.
STAT_LABELS: dict[str, tuple[str, ...]] = {
    "Strength": ("strength",),
    "Agility": ("agility",),
    "Stamina": ("stamina",),
    "Intellect": ("intellect",),
    "Spirit": ("spirit",),
    "Spell Damage": ("spell_damage",),
    "Healing Power": ("healing",),
    "Healing done": ("healing",),
    "Attack Power": ("attack_power", "ranged_attack_power"),
    "Armor": ("armor",),
    "Critical Strike chance": ("crit_pct", "spell_crit_pct"),
}

# Buffs that help a task, not a fight.
UTILITY_LABELS: dict[str, str] = {
    "Fishing Skill": "fishing",
    "Herbalism skill": "herbalism",
    "movement speed": "speed",
}


@dataclass(frozen=True)
class Tables:
    """The client rows the build reads (already parsed into ints where it matters)."""

    abilities: list[dict[str, str]]
    items: dict[int, dict[str, str]]
    item_spells: dict[int, list[int]]
    book: SpellBook
    # recipe spell -> lowest Classic trainer skill that teaches it
    trainer_skill: dict[int, int]


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except ValueError:
        return 0


def _over_time(book: SpellBook, spell_id: int, aura: int) -> dict[str, int] | None:
    for e in book.effects.get(spell_id, []):
        if e.effect == EFFECT_APPLY_AURA and e.aura == aura:
            ms = book.durations_ms.get(spell_id, 0)
            period = e.period_ms or 5000
            return {"amount": round(abs(e.base_points) * ms / period), "seconds": ms // 1000}
    return None


def _restores(book: SpellBook, use_spell: int) -> tuple[dict | None, dict | None]:
    """(heal, mana) of eating/drinking — on the use spell itself or the Food/Drink it triggers."""
    spells = [use_spell] + [
        e.trigger for e in book.effects.get(use_spell, []) if e.effect == EFFECT_TRIGGER_SPELL and e.trigger
    ]
    heal = next((h for s in spells if (h := _over_time(book, s, AURA_HEAL_OVER_TIME))), None)
    mana = next((m for s in spells if (m := _over_time(book, s, AURA_MANA_OVER_TIME))), None)
    return heal, mana


def _well_fed_spell(book: SpellBook, use_spell: int) -> int | None:
    for e in book.effects.get(use_spell, []):
        if e.aura in (AURA_PERIODIC_TRIGGER, AURA_PERIODIC_TRIGGER_LEGACY) and e.trigger:
            return e.trigger
    return None


def _part(amount: float, percent: bool, label: str) -> dict:
    part: dict = {
        "amount": int(amount) if amount.is_integer() else amount,
        "percent": percent,
        "label": label,
    }
    if label in STAT_LABELS:
        part["stats"] = list(STAT_LABELS[label])
    elif label in UTILITY_LABELS:
        part["utility"] = UTILITY_LABELS[label]
    return part


def parse_buff(text: str) -> dict | None:
    """The Well Fed buff in a tooltip: each thing it raises, its duration and any zone limit.

    "2 Stamina and Spirit" gives both stats 2 — a part without a number takes
    the one before it, as the tooltip reads.
    """
    zone = None
    if m := _INCREASE.search(text):
        parts = [_part(float(m.group(2)), m.group(3) == "%", m.group(1).strip())]
        duration = m.group(4)
    elif m := _GAIN.search(text):
        gained, duration = m.group(1).strip(), m.group(2)
        if where := _WHILE_IN.match(gained):
            gained, zone = where.group(1).strip(), where.group(2).strip()
        parts = []
        amount, percent = None, False
        for piece in _SPLIT.split(gained):
            pm = _PART.match(piece.strip())
            if not pm:
                return None
            if pm.group(1):
                amount, percent = float(pm.group(1)), pm.group(2) == "%"
            if amount is None:
                return None
            parts.append(_part(amount, percent, pm.group(3).strip()))
    else:
        return None
    buff: dict = {"parts": parts, "duration": duration}
    if zone:
        buff["zone"] = zone
    return buff


def _xp_bonus(book: SpellBook, use_spell: int) -> int | None:
    if str(WELL_FED_XP_BOOST) not in book.descriptions.get(use_spell, ""):
        return None
    e = book.effect(WELL_FED_XP_BOOST, 1)
    return int(abs(e.base_points)) if e else None


def _recipe_items(tables: Tables) -> dict[int, dict[str, str]]:
    """Recipe spell -> the "Recipe: ..." item that teaches it."""
    by_spell: dict[int, dict[str, str]] = {}
    for item_id, item in tables.items.items():
        if not item.get("Display_lang", "").startswith(RECIPE_PREFIX):
            continue
        for spell in tables.item_spells.get(item_id, []):
            taught = [e.trigger for e in tables.book.effects.get(spell, []) if e.effect == EFFECT_LEARN_SPELL]
            for recipe in [spell, *taught]:
                by_spell.setdefault(recipe, item)
    return by_spell


def _kind(text: str, heal: dict | None, mana: dict | None, buff: dict | None) -> str:
    """food / drink (eaten by one player), feast (placed for a group) or other."""
    if text.startswith("Serve "):
        return "feast"
    if heal:
        return "food"
    if mana:
        return "drink"
    return "other"


def build_foods(tables: Tables) -> list[dict]:
    """Every cooked food / drink the client lists, with what it does and how to learn it."""
    book = tables.book
    recipes = _recipe_items(tables)
    foods: dict[int, dict] = {}
    for ability in tables.abilities:
        if _int(ability["SkillLine"]) != COOKING_SKILL_LINE:
            continue
        recipe_spell = _int(ability["Spell"])
        made = [
            e for e in book.effects.get(recipe_spell, []) if e.effect == EFFECT_CREATE_ITEM
        ]
        for create in made:
            item = tables.items.get(create.item_type)
            if item is None:
                continue
            use_spells = tables.item_spells.get(create.item_type, [])
            if not use_spells:
                continue
            use_spell = use_spells[0]
            heal, mana = _restores(book, use_spell)
            text = evaluate(book, use_spell)
            # A feast's summon spell carries the Well Fed text of the food it sets out.
            buff = parse_buff(text) if _well_fed_spell(book, use_spell) or text.startswith("Serve ") else None
            recipe_item = recipes.get(recipe_spell)
            record: dict = {
                "id": create.item_type,
                "name": item["Display_lang"],
                "level": _int(item["RequiredLevel"]),
                "heal": heal,
                "mana": mana,
                "buff": buff,
                "xpBonusPct": _xp_bonus(book, use_spell) if buff else None,
                "tooltip": text,
                "learn": {
                    "source": "recipe" if recipe_item else "trainer",
                    "skill": _int(recipe_item["RequiredSkillRank"]) if recipe_item else tables.trainer_skill.get(recipe_spell),
                    "recipe": recipe_item["Display_lang"] if recipe_item else None,
                    "greyAt": _int(ability["TrivialSkillLineRankHigh"]) or None,
                },
            }
            record["kind"] = _kind(text, heal, mana, buff)
            foods.setdefault(create.item_type, record)
    return sorted(foods.values(), key=lambda f: (f["level"], f["name"]))
