"""Talent changes, read from the talent calculator's generated files (pure).

The talent build already works out which ranks read differently in Forever
(``data/talents/classic/<class>.json`` ``talents``: Classic's text per rank,
``None`` where the rank didn't change) and which talents Classic has no match
for (``newInForever`` in ``data/talents/<class>.json``). This turns that into
feed rows; it never compares a tooltip itself.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from scripts.wow_changes.describe import clean_text, describe_ranks, describe_text
from scripts.wow_changes.entry import KIND_CHANGED, KIND_NEW, PROVENANCE_PUBLISHED, Change

TalentDoc = Mapping[str, Any]


def _rank_label(index: int) -> str:
    return f"Rank {index + 1}"


def _talents(forever: TalentDoc) -> Iterable[tuple[str, Mapping[str, Any]]]:
    for tree in forever["trees"]:
        for talent in tree["talents"]:
            yield tree["name"], talent


def _changed(class_id: str, tree: str, talent: Mapping[str, Any], classic_ranks: list[str | None]) -> Change | None:
    rows = []
    summaries = []
    for i, (was, now) in enumerate(zip(classic_ranks, talent["ranks"])):
        if was is None:
            continue
        old, new = clean_text(was), clean_text(now)
        rows.append((_rank_label(i), old, new))
        summaries.append((_rank_label(i), describe_text(old, new)))
    if not rows:
        return None
    return Change(
        key=f"talent:{class_id}:{talent['id']}",
        kind=KIND_CHANGED,
        name=f"{talent['name']} ({tree})",
        summary=describe_ranks(summaries, len(talent["ranks"])),
        rows=tuple(rows),
        classes=(class_id,),
        link=("talent", class_id, talent["id"]),
        icon=("file", talent["icon"]) if talent.get("icon") else None,
        provenance=PROVENANCE_PUBLISHED,
    )


def _new(class_id: str, tree: str, talent: Mapping[str, Any]) -> Change:
    ranks = len(talent["ranks"])
    first = clean_text(talent["ranks"][0])
    return Change(
        key=f"talent:{class_id}:{talent['id']}",
        kind=KIND_NEW,
        name=f"{talent['name']} ({tree})",
        summary=f"New talent with {ranks} rank{'s' if ranks != 1 else ''}.",
        rows=(("Rank 1", None, first),),
        classes=(class_id,),
        link=("talent", class_id, talent["id"]),
        icon=("file", talent["icon"]) if talent.get("icon") else None,
        provenance=PROVENANCE_PUBLISHED,
    )


def live_talent_spells(forever_docs: Iterable[TalentDoc]) -> set[int]:
    """Every live talent's rank-1 spell, so the class-spell diff leaves talents to these rows."""
    return {talent["spell"] for doc in forever_docs for _, talent in _talents(doc)}


def talent_changes(
    forever_by_class: Mapping[str, TalentDoc],
    classic_by_class: Mapping[str, TalentDoc],
) -> list[Change]:
    """Every talent Forever changed or added, class by class in the calculator's order."""
    out: list[Change] = []
    for class_id, forever in sorted(forever_by_class.items()):
        changed = classic_by_class.get(class_id, {}).get("talents", {})
        for tree, talent in _talents(forever):
            if talent.get("newInForever"):
                out.append(_new(class_id, tree, talent))
            elif str(talent["id"]) in changed:
                entry = _changed(class_id, tree, talent, changed[str(talent["id"])])
                if entry is not None:
                    out.append(entry)
    return out
