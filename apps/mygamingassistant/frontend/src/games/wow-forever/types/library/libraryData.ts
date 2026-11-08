import type { LibraryBook } from "@/games/wow-forever/types/library/libraryBook";
import type { LibraryCard } from "@/games/wow-forever/types/library/libraryCard";
import type { LibraryQuest } from "@/games/wow-forever/types/library/libraryQuest";

/** The library page's decoded data. */
export interface LibraryData {
  books: LibraryBook[];
  cards: LibraryCard[];
  quests: LibraryQuest[];
  /** The day the quest cache was read (the "Seen in game" date). */
  seenOn: string;
  clientBuild: number;
}
