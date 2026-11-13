import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";

/**
 * Whether a quest can be shared: the client's flag when its seen row has one, else Classic's,
 * else unknown (null). A seen row from before the flag was read holds null there.
 */
export function questSharing(seenValue: unknown, classicValue: unknown): Pick<DungeonQuest, "shareable" | "shareableSeen"> {
  if (typeof seenValue === "boolean") return { shareable: seenValue, shareableSeen: true };
  return { shareable: typeof classicValue === "boolean" ? classicValue : null, shareableSeen: false };
}
