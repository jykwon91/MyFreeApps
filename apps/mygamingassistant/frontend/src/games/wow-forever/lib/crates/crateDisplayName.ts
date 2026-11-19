import { CRATE_NAME_PREFIX } from "@/games/wow-forever/data/professions/crates/cratesCopy";

/** "Waylaid Crate: Journeyman Herbs" -> "Journeyman Herbs". */
export function crateDisplayName(name: string): string {
  return name.startsWith(CRATE_NAME_PREFIX) ? name.slice(CRATE_NAME_PREFIX.length) : name;
}
