import { decodeQuestIndex } from "@/games/wow-forever/lib/quests/decodeQuestIndex";
import type { QuestIndex } from "@/games/wow-forever/types/quests/questIndex";
import type { QuestIndexFile } from "@/games/wow-forever/types/quests/questIndexFile";

let cached: Promise<QuestIndex> | null = null;

/** The quest index, loaded once in its own chunk (a failed load is tried again next time). */
export function loadQuestIndex(): Promise<QuestIndex> {
  if (!cached) {
    cached = import("@/games/wow-forever/data/quests/questIndex.json").then((file) =>
      decodeQuestIndex(file.default as unknown as QuestIndexFile),
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
