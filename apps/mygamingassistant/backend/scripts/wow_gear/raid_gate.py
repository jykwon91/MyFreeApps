"""Which Classic quests need a raid: gear the "Best gear" page can't list before raids open."""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping
from typing import Any

from scripts.wow_gear.loot import INSTANCE_RAID, as_int

Row = Mapping[str, Any]

QUEST_REQUIRED_ITEMS = 4
QUEST_CHOICE_REWARDS = 6
QUEST_REWARDS = 4
# Reputations only raids give (cmangos creature_onkill_reputation):
# * 270 Zandalar Tribe — every placed creature that gives it on kill is in Zul'Gurub (map 309).
# * 910 Brood of Nozdormu — Ahn'Qiraj kills (maps 509, 531); the Silithus creatures that also
#   give it (Colossus of Zora/Regal/Ashi, the Anubisath Warbringers, General Rajaxx at the
#   gates) are the Ahn'Qiraj war event, which only starts when the gates open. Quests that
#   need either reputation — the Signet Rings of the Bronze Dragonflight, the Zandalar
#   class/idol rewards — are raid quests.
RAID_REPUTATIONS = frozenset({270, 910})


def quest_reward_ids(quest: Row) -> set[int]:
    items = {as_int(quest.get(f"RewChoiceItemId{n}")) for n in range(1, QUEST_CHOICE_REWARDS + 1)}
    items |= {as_int(quest.get(f"RewItemId{n}")) for n in range(1, QUEST_REWARDS + 1)}
    return items - {0}


def raid_given_quests(
    relation_rows: Iterable[Row],
    templates: Iterable[Row],
    maps_of: Callable[[Row], set[int]],
    instance_types: Mapping[int, int],
) -> set[int]:
    """Quests every creature that gives them stands in a raid."""
    by_entry = {as_int(t["Entry"]): t for t in templates}
    inside: dict[int, bool] = {}
    for row in relation_rows:
        quest_id = as_int(row["quest"])
        template = by_entry.get(as_int(row["id"]))
        maps = maps_of(template) if template else set()
        raid = bool(maps) and all(instance_types.get(m) == INSTANCE_RAID for m in maps)
        inside[quest_id] = inside.get(quest_id, True) and raid
    return {quest_id for quest_id, raid in inside.items() if raid}


def _directly_gated(quest: Row, known: set[int], start_items: Mapping[int, int], raid_given: set[int]) -> bool:
    quest_id = as_int(quest["entry"])
    if quest_id in raid_given or as_int(quest.get("RequiredMinRepFaction")) in RAID_REPUTATIONS:
        return True
    needs = {as_int(quest.get(f"ReqItemId{n}")) for n in range(1, QUEST_REQUIRED_ITEMS + 1)}
    needs |= {as_int(quest.get("SrcItemId")), start_items.get(quest_id, 0)}
    return bool((needs - {0}) & known)


def raid_gated_quests(
    quest_rows: Iterable[Row],
    start_items: Mapping[int, int],
    raid_items: set[int],
    elsewhere: set[int],
    raid_given: set[int],
) -> set[int]:
    """Quests you can only finish with something only a raid gives — directly or further up the chain.

    A quest is raid-gated when a raid NPC gives it (``raid_given``), it needs a
    reputation only raids give (``RAID_REPUTATIONS``), it needs or is started
    by an item from ``raid_items`` (Plagueheart = Naxxramas tokens, "The Lord
    of Blackrock" = the Head of Nefarian), or it follows a raid-gated quest
    (``PrevQuestId``, or a gated quest's ``NextQuestId``). A reward every quest
    giving it is gated (and nothing in ``elsewhere`` gives) counts as a raid
    item too, so a chain that hands one on (Atiesh) is gated all the way.
    ``start_items`` maps quest id -> the item that starts it.
    """
    quests = list(quest_rows)
    givers: dict[int, set[int]] = defaultdict(set)
    for quest in quests:
        for item_id in quest_reward_ids(quest):
            givers[item_id].add(as_int(quest["entry"]))
    known = set(raid_items)
    gated: set[int] = set()
    # A quest's NextQuestId needs it done first (The Wrath of Neptulon -> The Might of Kalimdor).
    leads_to: set[int] = set()
    changed = True
    while changed:
        changed = False
        for quest in quests:
            quest_id = as_int(quest["entry"])
            if quest_id in gated:
                continue
            chained = as_int(quest.get("PrevQuestId")) in gated or quest_id in leads_to
            if chained or _directly_gated(quest, known, start_items, raid_given):
                gated.add(quest_id)
                if as_int(quest.get("NextQuestId")) > 0:
                    leads_to.add(as_int(quest["NextQuestId"]))
                changed = True
        for item_id, quest_ids in givers.items():
            if item_id not in known and item_id not in elsewhere and quest_ids <= gated:
                known.add(item_id)
                changed = True
    return gated
