/** A door that needs more than a level to go through (Classic `areatrigger_teleport`); 0 = not needed. */
export interface DungeonEntryRequirement {
  trigger: number;
  itemId: number;
  questId: number;
}
