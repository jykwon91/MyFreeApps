"""Which items are library books, which are library cards, and which quests reward a library, for ``/wow-forever/library``.

Everything here is read from the Forever client:

* **Books**: every ``ItemSparse`` row whose description ends "… addition to
  any library's collection." That sentence is how the game marks the books
  (some say "fine", others "questionable", "controversial", "puzzling" …).
  The Forever client keeps all 40 of them while it drops about three quarters
  of the other items in the same id range, so they are there on purpose.
* **Library cards**: ``ItemSparse`` rows named "<city> Library Card" (new in
  Forever: the Classic Era client has none).
* **Reward quests**: quests in the operator's quest cache whose title names
  the Library ("Friend of the Library"), with the rewards the server sent.

What the client does NOT say — where each book is found, who takes them and
how many books a reward needs — is server-side and stays unknown here.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from scripts.wow_dungeons.quest_cache import QuestCache
from scripts.wow_items.client_ids import QUALITY_BY_ID

BOOK_DESCRIPTION = re.compile(r"addition to any library's collection\.\s*$", re.IGNORECASE)
LIBRARY_CARD_NAME = re.compile(r"^(?P<city>.+) Library Card$")
REWARD_QUEST_TITLE = re.compile(r"\bLibrary\b")

BOOK_COLUMNS = ["id", "name", "description", "itemLevel", "quality"]
CARD_COLUMNS = ["id", "name", "city", "quality"]
QUEST_COLUMNS = ["id", "title", "level", "minLevel", "rewards", "choices"]

Row = Mapping[str, str]


@dataclass(frozen=True)
class LibraryBook:
    item_id: int
    name: str
    description: str
    item_level: int
    quality: str

    def as_row(self) -> list[str | int]:
        return [self.item_id, self.name, self.description, self.item_level, self.quality]


@dataclass(frozen=True)
class LibraryCard:
    item_id: int
    name: str
    city: str
    quality: str

    def as_row(self) -> list[str | int]:
        return [self.item_id, self.name, self.city, self.quality]


@dataclass(frozen=True)
class RewardQuest:
    quest_id: int
    title: str
    level: int
    min_level: int
    # (item id, count) the quest always gives, then the ones you choose one of.
    rewards: tuple[tuple[int, int], ...]
    choices: tuple[tuple[int, int], ...]

    def as_row(self) -> list[object]:
        return [
            self.quest_id, self.title, self.level, self.min_level,
            [list(r) for r in self.rewards], [list(c) for c in self.choices],
        ]

    def item_ids(self) -> set[int]:
        return {item for item, _ in self.rewards} | {item for item, _ in self.choices}


def item_quality(row: Row) -> str:
    return QUALITY_BY_ID[int(row.get("OverallQualityID") or 0)]


def is_library_book(row: Row) -> bool:
    return bool(BOOK_DESCRIPTION.search(row.get("Description_lang") or ""))


def library_books(sparse: Iterable[Row]) -> list[LibraryBook]:
    """The books, lowest item level first, then by name."""
    books = [
        LibraryBook(
            int(r["ID"]), r["Display_lang"].strip(), r["Description_lang"].strip(), int(r["ItemLevel"]), item_quality(r),
        )
        for r in sparse
        if is_library_book(r)
    ]
    return sorted(books, key=lambda b: (b.item_level, b.name, b.item_id))


def library_cards(sparse: Iterable[Row]) -> list[LibraryCard]:
    cards = []
    for r in sparse:
        match = LIBRARY_CARD_NAME.match((r.get("Display_lang") or "").strip())
        if match:
            cards.append(LibraryCard(int(r["ID"]), match.group(0), match.group("city"), item_quality(r)))
    return sorted(cards, key=lambda c: c.item_id)


def reward_quests(cache: QuestCache) -> list[RewardQuest]:
    """Quests the client has seen whose title names the Library, lowest id first."""
    return [
        RewardQuest(q.quest_id, q.title, q.level, q.min_level, q.rewards, q.choices)
        for _, q in sorted(cache.quests.items())
        if REWARD_QUEST_TITLE.search(q.title)
    ]
