import type { QuestDetailFile } from "@/games/wow-forever/types/quests/questDetailFile";

/**
 * The quest classic data shards, each its own lazy chunk: a quest page loads
 * one shard (`id % 64`), never the whole set. Globbed so the main bundle
 * never carries them.
 */
export const CLASSIC_QUEST_SHARDS = import.meta.glob<QuestDetailFile>(
  "./classic/[0-9][0-9].json",
  { import: "default" },
);
