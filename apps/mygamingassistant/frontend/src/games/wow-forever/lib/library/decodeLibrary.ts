import { isItemQuality, isItemSlot, type ItemQuality } from "@/games/wow-forever/data/itemSlots";
import type { LibraryBook } from "@/games/wow-forever/types/library/libraryBook";
import type { LibraryCard } from "@/games/wow-forever/types/library/libraryCard";
import type { LibraryData } from "@/games/wow-forever/types/library/libraryData";
import type { LibraryDataFile } from "@/games/wow-forever/types/library/libraryDataFile";
import type { LibraryRewardItem } from "@/games/wow-forever/types/library/libraryRewardItem";

function columnIndex(columns: readonly string[], name: string): number {
  const at = columns.indexOf(name);
  if (at < 0) throw new Error(`library.json has no "${name}" column`);
  return at;
}

function quality(value: unknown): ItemQuality {
  return typeof value === "string" && isItemQuality(value) ? value : "common";
}

function rewardItems(pairs: readonly [number, number][], items: LibraryDataFile["items"]): LibraryRewardItem[] {
  return pairs.flatMap(([id, count]) => {
    const row = items[String(id)];
    if (!row) return [];
    const [name, q, slot] = row;
    return [{ id, name, quality: quality(q), slot: slot && isItemSlot(slot) ? slot : null, count }];
  });
}

/** The generator's columnar file as typed books, cards and reward quests. */
export function decodeLibrary(file: LibraryDataFile): LibraryData {
  const b = (name: string) => columnIndex(file.bookColumns, name);
  const [bId, bName, bDesc, bIlvl, bQuality] = ["id", "name", "description", "itemLevel", "quality"].map(b);
  const books: LibraryBook[] = file.books.map((row) => ({
    id: Number(row[bId]),
    name: String(row[bName]),
    description: String(row[bDesc]),
    itemLevel: Number(row[bIlvl]),
    quality: quality(row[bQuality]),
  }));
  const c = (name: string) => columnIndex(file.cardColumns, name);
  const [cId, cName, cCity, cQuality] = ["id", "name", "city", "quality"].map(c);
  const cards: LibraryCard[] = file.cards.map((row) => ({
    id: Number(row[cId]),
    name: String(row[cName]),
    city: String(row[cCity]),
    quality: quality(row[cQuality]),
  }));
  const quests = file.quests.map(([id, title, level, minLevel, rewards, choices, seenOn]) => ({
    id,
    title,
    level,
    minLevel,
    rewards: rewardItems(rewards, file.items),
    choices: rewardItems(choices, file.items),
    seenOn,
  }));
  return { books, cards, quests };
}
