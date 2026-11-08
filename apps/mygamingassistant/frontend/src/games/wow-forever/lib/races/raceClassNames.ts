import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";

/** "Warrior", or "Hunter, Mage" — class ids as the game names them. */
export function raceClassNames(classes: readonly WowClassId[]): string {
  return classes.map((id) => findClass(id)?.name ?? id).join(", ");
}
