import { findSpec, firstSpec, type WowClassId } from "@/games/wow-forever/data/classes";
import { DEFAULT_GEAR_SETTINGS, GEAR_SETTINGS_STORAGE_KEY, parseGearSettings } from "@/games/wow-forever/hooks/useGearSettings";
import { readStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";

/** The spec the player last picked on the Best gear page, when it is for this class; else the class's first. */
export function savedGearSpec(classId: WowClassId): string {
  const stored = readStored<GearSettings | null>(
    GEAR_SETTINGS_STORAGE_KEY,
    (raw) => (typeof raw === "object" && raw !== null ? parseGearSettings(raw as Record<string, unknown>, DEFAULT_GEAR_SETTINGS) : null),
    null,
  );
  return stored && stored.classId === classId && findSpec(classId, stored.specId) ? stored.specId : firstSpec(classId);
}
