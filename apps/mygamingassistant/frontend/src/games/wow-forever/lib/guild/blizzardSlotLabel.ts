import { PAPER_DOLL_LEFT, PAPER_DOLL_RIGHT, PAPER_DOLL_WEAPONS } from "@/games/wow-forever/data/character/characterConfig";

const LABELS: ReadonlyMap<string, string> = new Map(
  [...PAPER_DOLL_LEFT, ...PAPER_DOLL_RIGHT, ...PAPER_DOLL_WEAPONS].map((s) => [s.slot, s.label]),
);

/** The character pane's label for a Blizzard slot ("WRIST" → "Wrist"); the raw slot when unknown. */
export function blizzardSlotLabel(slot: string): string {
  return LABELS.get(slot) ?? slot;
}
