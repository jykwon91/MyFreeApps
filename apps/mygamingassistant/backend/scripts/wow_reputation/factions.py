"""Forever's reputation-pane headers and the factions under each, from the Game Data API.

``/data/wow/reputation-faction/index`` lists ``root_factions``: the pane's
headers (Alliance, Horde Forces, Steamwheedle Cartel…, ``is_header``) and the
factions with no header. Each header's own answer lists its ``factions``; a
header under a header becomes a group of its own. Factions under no header are
the "Other" group, which the character page builds itself, so it isn't here.
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

FactionAnswer = Callable[[int], dict[str, Any]]


def _side(answer: dict[str, Any]) -> str | None:
    side = (answer.get("player_faction") or {}).get("type")
    return side.lower() if isinstance(side, str) and side else None


def _collect(answer: dict[str, Any], side: str | None, fetch: FactionAnswer, groups: list[dict[str, Any]]) -> None:
    own_side = _side(answer) or side
    members: list[int] = []
    for child in answer.get("factions") or []:
        child_answer = fetch(int(child["id"]))
        if child_answer.get("is_header"):
            _collect(child_answer, own_side, fetch, groups)
        else:
            members.append(int(child["id"]))
    groups.append({"id": int(answer["id"]), "name": str(answer["name"]), "side": own_side, "factions": sorted(members)})


def faction_groups(index: dict[str, Any], fetch: FactionAnswer) -> list[dict[str, Any]]:
    """Every header with its factions' ids, by header id so a refresh diff stays small."""
    groups: list[dict[str, Any]] = []
    for root in index.get("root_factions") or []:
        answer = fetch(int(root["id"]))
        if answer.get("is_header"):
            _collect(answer, None, fetch, groups)
    return sorted(groups, key=lambda group: group["id"])
