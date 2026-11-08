import type { LibraryRewardItem } from "@/games/wow-forever/types/library/libraryRewardItem";

/** A quest whose title names the Library, as the Forever server sent it to our client. */
export interface LibraryQuest {
  id: number;
  title: string;
  level: number;
  minLevel: number;
  /** Items the quest always gives. */
  rewards: LibraryRewardItem[];
  /** Items you choose one of. */
  choices: LibraryRewardItem[];
}
