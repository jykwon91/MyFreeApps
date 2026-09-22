"""Claude tool definition + system prompt for reading a WoW item tooltip.

The tool's ``input_schema`` is the structured-output contract; the mapper
(``item_response_mapper``) re-validates everything because tool input is shaped
by the schema but not guaranteed by it. Nullable enums use ``anyOf`` with a
``null`` branch (an ``enum`` containing ``null`` is rejected by some validators).
"""
from typing import Any

from app.schemas.wow.extracted_item import ITEM_QUALITIES, ITEM_SLOTS
from app.services.wow.stat_keys import STAT_KEYS

TOOL_NAME = "record_item"


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


ITEM_TOOL: dict[str, Any] = {
    "name": TOOL_NAME,
    "description": "Record the stats of one World of Warcraft item tooltip.",
    "input_schema": {
        "type": "object",
        "properties": {
            "is_item_tooltip": {
                "type": "boolean",
                "description": "False if the input is not a WoW item tooltip.",
            },
            "name": _nullable({"type": "string"}),
            "quality": _nullable({"type": "string", "enum": list(ITEM_QUALITIES)}),
            "slot": _nullable({"type": "string", "enum": list(ITEM_SLOTS)}),
            "item_type": _nullable(
                {
                    "type": "string",
                    "description": "Armor or weapon type, e.g. Leather, Plate, Sword, Bow, Shield, Idol.",
                }
            ),
            "armor": _nullable({"type": "integer"}),
            "weapon": _nullable(
                {
                    "type": "object",
                    "properties": {
                        "min_damage": {"type": "number"},
                        "max_damage": {"type": "number"},
                        "speed": {"type": "number"},
                        "dps": {"type": "number"},
                    },
                    "required": ["min_damage", "max_damage", "speed"],
                }
            ),
            "stats": {
                "type": "object",
                "properties": {key: {"type": "number"} for key in STAT_KEYS},
                "additionalProperties": False,
            },
            "unparsed_effects": {"type": "array", "items": {"type": "string"}},
            "required_level": _nullable({"type": "integer"}),
            "set_name": _nullable({"type": "string"}),
        },
        "required": ["is_item_tooltip", "stats", "unparsed_effects"],
    },
}

SYSTEM_PROMPT = f"""\
You read World of Warcraft item tooltips (Classic Era and the "Forever" \
re-release) and record them with the {TOOL_NAME} tool. Always call the tool exactly once.

Rules:
- If the input is not a WoW item tooltip, call the tool with is_item_tooltip=false and empty stats.
- Only record what the tooltip shows. Never guess or add stats from memory of the item.
- name: the first line (the item name). quality: from the name colour if an image \
(gray=poor, white=common, green=uncommon, blue=rare, purple=epic, orange=legendary); null if unknown.
- slot: the equip slot line. "One-Hand"->one_hand, "Main Hand"->main_hand, "Off Hand"->off_hand, \
"Held In Off-hand"->held_in_off_hand, "Two-Hand"->two_hand, Idol/Libram/Totem/Relic->relic.
- armor: the "N Armor" line. For a shield, record its "N Block" line as stats.block_value.
- weapon: "min - max Damage" and "Speed x.xx"; dps from "(N damage per second)" if shown.
- Primary stats "+N Strength" etc. go in stats. Negative values are allowed.
- "Equip:" and green-text lines map to stat keys when they match exactly:
  - "Improves your chance to hit by N%" -> hit_pct; "...critical strike by N%" -> crit_pct
  - "...hit with spells by N%" -> spell_hit_pct; "...critical strike with spells by N%" -> spell_crit_pct
  - "+N Attack Power" -> attack_power; "+N ranged Attack Power" -> ranged_attack_power
  - "+N Attack Power in Cat, Bear, and Dire Bear forms only" -> feral_attack_power
  - "Increases damage and healing done by magical spells and effects by up to N" -> spell_power
  - "Increases damage done by magical spells and effects by up to N" (no healing) -> spell_damage
  - "Increases healing done by spells and effects by up to N" -> healing
  - "Increases damage done by Fire spells and effects by up to N" -> fire_spell_damage (same for \
arcane/frost/holy/nature/shadow)
  - "Restores N mana per 5 sec" -> mp5; "Increased Defense +N" -> defense
  - "...dodge an attack by N%" -> dodge_pct; "...parry an attack by N%" -> parry_pct; \
"...block attacks with a shield by N%" -> block_pct; "...block value of your shield by N" -> block_value
  - "Decreases the magical resistances of your spell targets by N" -> spell_penetration
  - "+N Fire Resistance" -> fire_resistance (etc.); "+N All Resistances" -> all_resistance
  - Expertise: "Increases your expertise by N" or "+N Expertise" -> expertise; \
"expertise rating by N" -> expertise_rating
  - Any stat shown as a RATING ("+N Hit Rating", "Improves hit rating by N", crit/haste/defense/\
dodge/parry/block rating) goes to the matching *_rating key, never to a *_pct key.
  - "Increases your attack speed by N%" -> haste_pct; spell casting speed by N% -> spell_haste_pct
- Anything else (procs, "Chance on hit", "Use:" effects, set bonuses, unknown stats) goes \
verbatim into unparsed_effects. Do not invent a stat key for it.
- Ignore durability, sell price, item level, class restrictions and flavour text.
- required_level from "Requires Level N"; set_name from a set line like "Wildheart Raiment (0/8)" \
(without the count).
"""
