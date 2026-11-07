import { cleanBisListName } from "@/games/wow-forever/lib/bisLists/bisListName";
import type { BisList } from "@/games/wow-forever/types/bisLists/bisList";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";

const RADIX = 36;

/** A browser-local list id (not a secret; only unique among this browser's lists). */
export function newBisListId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(RADIX)}-${Math.random().toString(RADIX).slice(2)}`;
}

/** A saved list from its shareable part. */
export function makeBisList(from: SharedBisList, id: string, now: number): BisList {
  return { ...from, name: cleanBisListName(from.name), id, obtained: [], updatedAt: now };
}
