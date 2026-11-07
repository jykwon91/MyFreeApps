import { bisListPhaseLabel } from "@/games/wow-forever/data/bisLists/bisListPhases";
import { BIS_SLOTS, type BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import { findClass, findSpec } from "@/games/wow-forever/data/classes";
import type { BisList } from "@/games/wow-forever/types/bisLists/bisList";
import type { BisListProgress } from "@/games/wow-forever/types/bisLists/bisListProgress";
import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";

/** "Affliction Warlock · Pre-raid". */
export function bisListSubtitle(list: Pick<SharedBisList, "classId" | "specId" | "phase">): string {
  const cls = findClass(list.classId)?.name ?? list.classId;
  const spec = findSpec(list.classId, list.specId)?.name;
  return `${spec ? `${spec} ${cls}` : cls} · ${bisListPhaseLabel(list.phase)}`;
}

/** A new list's name when none is typed: "Affliction Warlock Pre-raid". */
export function suggestedBisListName(list: Pick<SharedBisList, "classId" | "specId" | "phase">): string {
  return bisListSubtitle(list).replace(" · ", " ");
}

/** Filled rows, and how many of them the player has ticked "I have it". */
export function bisListProgress(list: BisList): BisListProgress {
  const filled = Object.keys(list.items).length;
  const obtained = list.obtained.filter((slot) => list.items[slot] !== undefined).length;
  return { filled, obtained };
}

/** "Main hand and Off hand", in character-sheet order. */
export function bisSlotLabels(slots: readonly BisSlotId[]): string {
  return BIS_SLOTS.filter((s) => slots.includes(s.id))
    .map((s) => s.label)
    .join(" and ");
}
