import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";

/** All entries in `entries` that are tagged for `classId`. Order is preserved. */
export function classChangesFor(entries: readonly ChangeEntry[], classId: WowClassId): readonly ChangeEntry[] {
  return entries.filter((entry) => entry.classes.includes(classId));
}
