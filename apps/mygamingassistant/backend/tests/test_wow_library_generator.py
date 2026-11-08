"""The library books page's data: which items are books / library cards, which quests reward the Library."""
from __future__ import annotations

import json

import pytest

from scripts.wow_dungeons.quest_cache import CachedQuest, QuestCache
from scripts.wow_library.build import LIBRARY_PATH, reward_item_rows
from scripts.wow_library.library import (
    BOOK_COLUMNS,
    CARD_COLUMNS,
    QUEST_COLUMNS,
    is_library_book,
    library_books,
    library_cards,
    reward_quests,
)


def _sparse(item_id: int, name: str, description: str = "", ilvl: int = 10, quality: int = 1) -> dict[str, str]:
    return {
        "ID": str(item_id), "Display_lang": name, "Description_lang": description,
        "ItemLevel": str(ilvl), "OverallQualityID": str(quality),
    }


def _quest(quest_id: int, title: str, choices: tuple[tuple[int, int], ...] = ()) -> CachedQuest:
    return CachedQuest(quest_id, title, 20, 1, (), (), choices)


class TestBooks:
    def test_the_library_sentence_marks_a_book_whatever_the_adjective(self) -> None:
        for desc in (
            "A fine addition to any library's collection.",
            "A questionable addition to any library's collection.",
            "An informative, if bleak, addition to any library's collection.",
        ):
            assert is_library_book(_sparse(1, "Book", desc))

    def test_other_descriptions_are_not_books(self) -> None:
        assert not is_library_book(_sparse(1, "Tome", "Teaches you how to cast Frostbolt."))
        assert not is_library_book(_sparse(1, "Note", ""))
        # The sentence has to end the description.
        assert not is_library_book(_sparse(1, "Note", "An addition to any library's collection. Or not."))

    def test_books_sort_by_item_level_then_name(self) -> None:
        rows = [
            _sparse(3, "Zeta", "A fine addition to any library's collection.", 10),
            _sparse(1, "Alpha", "A fine addition to any library's collection.", 50),
            _sparse(2, "Beta", "A fine addition to any library's collection.", 10, quality=2),
            _sparse(4, "Sword", "Sharp.", 10),
        ]
        books = library_books(rows)
        assert [b.item_id for b in books] == [2, 3, 1]
        assert books[0].as_row() == [2, "Beta", "A fine addition to any library's collection.", 10, "uncommon"]


class TestCards:
    def test_cards_are_named_city_library_card(self) -> None:
        rows = [_sparse(9, "Undercity Library Card"), _sparse(8, "Stormwind Library Card"), _sparse(7, "Library")]
        assert [c.as_row() for c in library_cards(rows)] == [
            [8, "Stormwind Library Card", "Stormwind", "common"],
            [9, "Undercity Library Card", "Undercity", "common"],
        ]


class TestRewardQuests:
    def test_quests_naming_the_library_are_kept_with_their_rewards(self) -> None:
        cache = QuestCache(1, {
            5: _quest(5, "Friend of the Library", ((100, 1), (101, 1))),
            4: _quest(4, "The Library Card"),
            6: _quest(6, "Librarian's Errand"),
        }, frozenset())
        quests = reward_quests(cache)
        assert [q.quest_id for q in quests] == [4, 5]
        assert quests[1].as_row() == [5, "Friend of the Library", 20, 1, [], [[100, 1], [101, 1]]]
        assert quests[1].item_ids() == {100, 101}

    def test_a_reward_missing_from_items_json_stops_the_run(self) -> None:
        doc = {"columns": ["id", "name", "quality", "slot"], "items": [[100, "Pendant", "uncommon", "neck"]]}
        assert reward_item_rows(doc, {100}) == {"100": ["Pendant", "uncommon", "neck"]}
        with pytest.raises(SystemExit):
            reward_item_rows(doc, {100, 101})


@pytest.fixture(scope="module")
def doc() -> dict:
    return json.loads(LIBRARY_PATH.read_text(encoding="utf-8"))


class TestCommittedOutput:
    def test_columns_match_the_generator(self, doc: dict) -> None:
        assert doc["bookColumns"] == BOOK_COLUMNS
        assert doc["cardColumns"] == CARD_COLUMNS
        assert doc["questColumns"] == QUEST_COLUMNS

    def test_the_forever_client_has_forty_books(self, doc: dict) -> None:
        books = {row[0]: row for row in doc["books"]}
        assert len(books) == 40
        assert books[203754][1] == "Archmage Antonidas: The Unabridged Autobiography"
        assert all(row[2].endswith("addition to any library's collection.") for row in books.values())

    def test_library_cards_and_friend_of_the_library(self, doc: dict) -> None:
        assert [row[1] for row in doc["cards"]] == ["Stormwind Library Card", "Undercity Library Card"]
        friend = next(q for q in doc["quests"] if q[0] == 78150)
        assert friend[1] == "Friend of the Library"
        assert {item for item, _ in friend[5]} == {277203, 277204}
        assert doc["items"]["277203"][0] == "Scholarly Pendant"

    def test_every_reward_item_is_named(self, doc: dict) -> None:
        named = {int(k) for k in doc["items"]}
        for quest in doc["quests"]:
            assert {item for item, _ in [*quest[4], *quest[5]]} <= named
