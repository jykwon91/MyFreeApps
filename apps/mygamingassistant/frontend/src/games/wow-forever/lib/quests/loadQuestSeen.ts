import type { QuestSeenFile } from "@/games/wow-forever/types/quests/questSeenFile";

let cached: Promise<QuestSeenFile> | null = null;

/** The quest-seen overlay file, loaded once and cached. */
export function loadQuestSeen(): Promise<QuestSeenFile> {
  if (!cached) {
    cached = import("@/games/wow-forever/data/quests/questSeen.json").then(
      (m) => m.default as unknown as QuestSeenFile,
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
